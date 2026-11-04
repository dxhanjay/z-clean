import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { redeemVoucherSchema } from "@/lib/validation";
import { validateVoucher } from "@/lib/vouchers";
import { applyPrepaidRedemption, loadVoucherByCode } from "@/lib/vouchers-server";

/**
 * POST /api/admin/orders/[id]/redeem-voucher — cashier redemption of a
 * PREPAID gift card against an order that still has money outstanding
 * (Phase 7b, Requirements v2 §3 finance rules).
 *
 * Outstanding is defined precisely from the order row:
 *   if payment_status = 'paid'      → nothing outstanding (422)
 *   otherwise outstanding           = total_paise − voucher_redeemed_paise
 * The card pays min(balance, outstanding); voucher_redeemed_paise grows
 * by that amount, and when the outstanding reaches 0 the order's
 * payment_status becomes 'paid' (any remaining balance — e.g. collector
 * cash — is accounted in Phase 9 finance).
 *
 * Promo vouchers are DISCOUNT codes for checkout only — this route
 * rejects them with a clear message rather than treating them as money.
 * Voucher reads/writes run through the service-role client (bearer
 * instrument; gift_vouchers is admin-only under RLS) after the admin
 * gate has authenticated the cashier.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json(
      {
        mode: "demo",
        message:
          "Gift card redemption needs the live database — in demo mode no balance is moved.",
        code: "LIVE_ONLY",
      },
      { status: 503 },
    );
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { supabase, user } = gate;
  const { id: orderId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = redeemVoucherSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter the gift card code.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, payment_status, subtotal_paise, total_paise, voucher_redeemed_paise")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    return NextResponse.json({ error: "Could not load the order." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.payment_status === "paid") {
    return NextResponse.json(
      { error: "This order is already fully paid — nothing is outstanding.", code: "NOTHING_OUTSTANDING" },
      { status: 422 },
    );
  }
  const outstandingPaise = order.total_paise - (order.voucher_redeemed_paise ?? 0);
  if (outstandingPaise <= 0) {
    return NextResponse.json(
      { error: "This order has no outstanding balance.", code: "NOTHING_OUTSTANDING" },
      { status: 422 },
    );
  }

  // The order's service slugs, for the voucher's eligibility rules.
  const { data: itemRows } = await supabase
    .from("order_items")
    .select("price_items ( services ( slug ) )")
    .eq("order_id", orderId);
  const serviceSlugs = [
    ...new Set(
      (itemRows ?? []).flatMap((row) => {
        const slug = (row as { price_items?: { services?: { slug?: string } | null } | null })
          .price_items?.services?.slug;
        return slug ? [slug] : [];
      }),
    ),
  ];

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Gift cards cannot be verified right now (server configuration).", code: "VOUCHER_UNAVAILABLE" },
      { status: 500 },
    );
  }
  const voucher = await loadVoucherByCode(adminClient, parsed.data.code);
  if (!voucher) {
    return NextResponse.json(
      { error: `Gift card "${parsed.data.code.trim().toUpperCase()}" was not recognised.`, code: "VOUCHER_INVALID" },
      { status: 422 },
    );
  }
  if (voucher.kind === "promo") {
    return NextResponse.json(
      {
        error:
          "That code is a promo voucher — promo vouchers are discount codes that the customer applies at checkout. They cannot be redeemed as payment here.",
        code: "PROMO_CHECKOUT_ONLY",
      },
      { status: 422 },
    );
  }

  const validation = validateVoucher(voucher, {
    subtotalPaise: order.subtotal_paise,
    amountDuePaise: outstandingPaise,
    serviceSlugs,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.reasons[0] ?? "This gift card cannot be used on this order.", code: "VOUCHER_INVALID", reasons: validation.reasons },
      { status: 422 },
    );
  }
  const redeemPaise = validation.redeemablePaise;

  let balanceAfterPaise: number;
  try {
    const applied = await applyPrepaidRedemption(
      adminClient,
      voucher,
      redeemPaise,
      orderId,
      { userId: user.id, label: user.email ?? null },
      "Gift card redeemed at the cashier desk",
    );
    balanceAfterPaise = applied.balanceAfterPaise;
  } catch {
    return NextResponse.json(
      { error: "The redemption could not be completed. No balance was confirmed moved — please retry." },
      { status: 500 },
    );
  }

  const newRedeemedTotal = (order.voucher_redeemed_paise ?? 0) + redeemPaise;
  const newOutstanding = order.total_paise - newRedeemedTotal;
  const nowPaid = newOutstanding <= 0;

  const { data: currentOrder } = await supabase
    .from("orders")
    .select("voucher_code")
    .eq("id", orderId)
    .maybeSingle();
  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({
      voucher_redeemed_paise: newRedeemedTotal,
      voucher_code: currentOrder?.voucher_code ?? voucher.code,
      ...(nowPaid ? { payment_status: "paid" } : {}),
    })
    .eq("id", orderId);
  if (orderUpdateError) {
    return NextResponse.json(
      {
        error:
          "The card balance was reduced but the order update failed. Contact support with the order reference before retrying.",
        code: "ORDER_UPDATE_FAILED",
      },
      { status: 500 },
    );
  }

  await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: order.status,
    note: nowPaid
      ? `Gift card ${voucher.code} redeemed — order paid in full.`
      : `Gift card ${voucher.code} redeemed towards this order.`,
    actor_id: user.id,
  });

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "voucher.redeem",
    entity: "gift_vouchers",
    entityId: voucher.id,
    details: {
      orderId,
      code: voucher.code,
      via: "cashier",
      redeemedPaise: redeemPaise,
      balanceAfterPaise,
      outstandingAfterPaise: Math.max(0, newOutstanding),
      paymentStatus: nowPaid ? "paid" : order.payment_status,
    },
  });

  return NextResponse.json({
    mode: "live",
    orderId,
    redeemedPaise: redeemPaise,
    voucherRedeemedTotalPaise: newRedeemedTotal,
    outstandingPaise: Math.max(0, newOutstanding),
    paymentStatus: nowPaid ? "paid" : order.payment_status,
    voucherBalanceAfterPaise: balanceAfterPaise,
  });
}
