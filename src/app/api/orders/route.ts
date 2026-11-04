import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { orderSchema } from "@/lib/validation";
import { isPincodeServiceable } from "@/lib/pricing";
import { computeOrderTotals } from "@/lib/totals";
import {
  createRazorpayOrder,
  isRazorpayConfigured,
  loadCatalogue,
  resolveCoupon,
} from "@/lib/orders-server";
import {
  hasVoucherCouponConflict,
  validateVoucher,
  type GiftVoucher,
} from "@/lib/vouchers";
import {
  applyPrepaidRedemption,
  applyPromoRedemption,
  loadVoucherByCode,
} from "@/lib/vouchers-server";
import { logAudit } from "@/lib/audit";
import { pickupSlotIso } from "@/lib/slot-time";
import { generateOtp } from "@/lib/handovers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { notConfiguredResponse } from "@/lib/api-errors";

/**
 * POST /api/orders — place an order (Phase 3).
 *
 * Trust model: the client sends items, choices and the total IT computed
 * with the shared totals engine. The server then RE-CALCULATES everything
 * from catalogue data (the `price_items` table when Supabase is configured,
 * the approved local catalogue otherwise) and REJECTS the order with 409
 * when the totals do not match. Client totals are never trusted.
 *
 * Modes:
 *  - Supabase not configured → validation + recalculation still run, then
 *    503 { mode: "demo" } and the client stores the order locally, badged
 *    DEMO MODE (same pattern as /api/pickups). Nothing is faked.
 *  - Supabase configured → the signed-in customer's order, its items and
 *    the first status-history row are inserted (RLS applies; sign-in is
 *    required because orders.user_id is mandatory).
 *      · Pay on Delivery → payment_status "cod_pending", status
 *        PICKUP_SCHEDULED, immediate confirmation.
 *      · Razorpay → a Razorpay order is created server-side (test mode
 *        keys), a payments row is stored as "created", and the gateway
 *        order id is returned for Checkout. The order stays
 *        PAYMENT_PENDING until the verified webhook confirms payment —
 *        the browser callback alone never marks an order paid.
 */

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) },
      { status: 422 },
    );
  }
  const data = parsed.data;

  if (!isPincodeServiceable(data.pincode)) {
    return NextResponse.json(
      {
        error:
          "Sorry, we are not serviceable at this pincode yet. We currently serve Bokaro Steel City (827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014, 829301).",
        fieldErrors: { pincode: "Not serviceable yet" },
      },
      { status: 422 },
    );
  }

  // Voucher + coupon never stack (Phase 7b) — checked before any totals
  // work so the customer gets one clear answer.
  const couponCodeInput = data.couponCode?.trim().toUpperCase() || "";
  const voucherCodeInput = data.voucherCode?.trim().toUpperCase() || "";
  if (hasVoucherCouponConflict(couponCodeInput, voucherCodeInput)) {
    return NextResponse.json(
      {
        error:
          "A gift voucher and a coupon cannot be used on the same order. Please use one or the other.",
        code: "VOUCHER_COUPON_CONFLICT",
      },
      { status: 422 },
    );
  }

  // Who is ordering? Live orders need an account (orders.user_id NOT NULL).
  // Dual auth (Mobile Phase 1): the web cookie session OR a validated
  // `Authorization: Bearer <access-token>` from the mobile app — the
  // resolved client carries the caller's identity, so every insert
  // below runs under that user's RLS either way.
  const auth = await resolveRequestAuth();
  if (auth.kind === "misconfigured") {
    return notConfiguredResponse();
  }
  const supabase = auth.kind === "unconfigured" ? null : auth.supabase;
  let userId: string | null = null;
  let userEmail: string | null = null;
  if (supabase) {
    if (auth.kind !== "user") {
      return NextResponse.json(
        { error: "Please sign in to place an order.", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }
    userId = auth.user.id;
    userEmail = auth.user.email ?? null;
  }

  // Rate limit (P0): order placement is capped per signed-in user
  // (20/hour), falling back to the client IP when there is no user
  // (demo mode). The limiter fails open — a counter outage never
  // blocks a genuine order.
  const rateKey = userId
    ? `orders:user:${userId}`
    : `orders:ip:${getClientIp(request)}`;
  if (!(await checkRateLimit(rateKey, 20, 3600))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  // First-order check for first-order-only coupons.
  let isFirstOrder = true;
  if (supabase && userId) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    isFirstOrder = (count ?? 0) === 0;
  }

  // Server-side recalculation from catalogue data — never trust the client.
  const catalogue = await loadCatalogue(supabase);
  const couponCode = data.couponCode?.trim().toUpperCase() || undefined;
  const resolved = couponCode
    ? await resolveCoupon(supabase, couponCode)
    : { coupon: null, couponId: null };

  const totals = computeOrderTotals({
    items: data.items,
    deliveryType: data.deliveryType,
    couponCode,
    coupon: couponCode ? resolved.coupon : undefined,
    isFirstOrder,
    catalogue: catalogue.entries,
  });
  if (!totals.ok) {
    return NextResponse.json(
      { error: totals.error, code: totals.code },
      { status: 422 },
    );
  }

  if (data.expectedTotalPaise !== totals.totalPaise) {
    return NextResponse.json(
      {
        error:
          "The total changed while you were ordering (prices are confirmed on the server). Please review the updated total and try again.",
        code: "TOTAL_MISMATCH",
        serverTotalPaise: totals.totalPaise,
      },
      { status: 409 },
    );
  }

  // Demo mode: fully validated + recalculated, but there is no database.
  if (!supabase || !userId) {
    return NextResponse.json(
      { mode: "demo", message: "Supabase not configured — demo mode.", totals },
      { status: 503 },
    );
  }

  // --- Gift voucher (Phase 7b), live mode only. The base-total integrity
  // check above has already passed: the client never computes voucher
  // effects. The voucher is resolved through the service-role client
  // (codes are bearer instruments; the table is admin-only under RLS)
  // and validated against the server-computed totals. A promo reduces
  // the final total; a prepaid card pays part/all of it as a payment.
  let adminClient: SupabaseClient | null = null;
  let voucherPlan: {
    voucher: GiftVoucher;
    discountPaise: number;
    redeemPaise: number;
  } | null = null;
  if (voucherCodeInput) {
    adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        {
          error: "Gift vouchers cannot be verified right now. Please place the order without the voucher, or contact us.",
          code: "VOUCHER_UNAVAILABLE",
        },
        { status: 422 },
      );
    }
    const voucher = await loadVoucherByCode(adminClient, voucherCodeInput);
    if (!voucher) {
      return NextResponse.json(
        {
          error: `Voucher "${voucherCodeInput}" was not recognised. Check the code and try again.`,
          code: "VOUCHER_INVALID",
          reasons: ["Code not recognised."],
        },
        { status: 422 },
      );
    }
    const validation = validateVoucher(voucher, {
      subtotalPaise: totals.subtotalPaise,
      amountDuePaise: totals.totalPaise,
      serviceSlugs: [...new Set(data.items.map((i) => i.serviceSlug))],
    });
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.reasons[0] ?? "This voucher cannot be used on this order.",
          code: "VOUCHER_INVALID",
          reasons: validation.reasons,
        },
        { status: 422 },
      );
    }
    voucherPlan = {
      voucher,
      discountPaise: validation.discountPaise,
      redeemPaise: validation.redeemablePaise,
    };
  }
  const finalTotalPaise = totals.totalPaise - (voucherPlan?.discountPaise ?? 0);
  const amountDuePaise = finalTotalPaise - (voucherPlan?.redeemPaise ?? 0);
  const nothingDue = amountDuePaise <= 0;
  const voucherSummary = voucherPlan
    ? {
        code: voucherPlan.voucher.code,
        kind: voucherPlan.voucher.kind,
        discountPaise: voucherPlan.discountPaise,
        redeemedPaise: voucherPlan.redeemPaise,
        amountDuePaise,
      }
    : null;

  // --- Live mode: persist address, order, items, first history row. ---
  const { data: address, error: addressError } = await supabase
    .from("addresses")
    .insert({
      user_id: userId,
      label: "Order address",
      line: data.addressLine,
      area: data.area,
      city: data.city,
      pincode: data.pincode,
    })
    .select("id")
    .single();
  if (addressError || !address) {
    return NextResponse.json(
      { error: "Could not save your address. Please try again." },
      { status: 500 },
    );
  }

  const isCod = data.paymentMethod === "cod";
  const initialStatus = nothingDue || isCod ? "PICKUP_SCHEDULED" : "PAYMENT_PENDING";
  const initialPaymentStatus = nothingDue ? "paid" : isCod ? "cod_pending" : "pending";

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      address_id: address.id,
      delivery_type: data.deliveryType,
      payment_method: data.paymentMethod,
      status: initialStatus,
      payment_status: initialPaymentStatus,
      pickup_slot: pickupSlotIso(data.pickupDate, data.pickupSlot),
      subtotal_paise: totals.subtotalPaise,
      discount_paise: totals.discountPaise,
      total_paise: finalTotalPaise,
      coupon_id: totals.couponApplied ? resolved.couponId : null,
      voucher_code: voucherPlan ? voucherPlan.voucher.code : null,
      voucher_discount_paise: voucherPlan?.discountPaise ?? 0,
      voucher_redeemed_paise: voucherPlan?.redeemPaise ?? 0,
      // Phase 8 handover credentials: an unguessable QR token plus the
      // customer's pickup/delivery OTPs. The customer sees them on
      // their order page; staff verify them at the doorstep handovers.
      qr_token: crypto.randomUUID(),
      pickup_otp: generateOtp(),
      delivery_otp: generateOtp(),
    })
    .select("id, status, payment_status, created_at")
    .single();
  if (orderError || !order) {
    return NextResponse.json(
      { error: "Could not place your order. Please try again." },
      { status: 500 },
    );
  }

  const itemRows = totals.lines.map((line) => ({
    order_id: order.id,
    price_item_id: catalogue.priceItemIds
      ? (catalogue.priceItemIds.get(`${line.serviceSlug}::${line.itemName}`) ?? null)
      : null,
    qty: line.qty,
    unit_price_paise: line.unitPricePaise,
    line_total_paise: line.lineTotalPaise,
  }));
  const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
  if (itemsError) {
    return NextResponse.json(
      { error: "Your order was created but its items could not be saved. Please contact us with your order reference.", orderId: order.id },
      { status: 500 },
    );
  }

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: initialStatus,
    note: nothingDue
      ? voucherPlan && voucherPlan.redeemPaise > 0
        ? `Order placed — paid in full with gift card ${voucherPlan.voucher.code}.`
        : `Order placed — fully covered by voucher ${voucherPlan?.voucher.code ?? ""}.`
      : isCod
        ? voucherPlan && voucherPlan.redeemPaise > 0
          ? `Order placed — part-paid with gift card ${voucherPlan.voucher.code}; the rest is payable on delivery.`
          : "Order placed — pay on delivery."
        : "Order placed — awaiting online payment.",
    actor_id: userId,
  });

  // Apply the voucher now that the order exists: consume the promo use
  // or move the card balance + write the voucher payment row, and ledger
  // the redemption. If this fails the order stands (it references the
  // voucher), and support can reconcile from the voucher ledger — the
  // customer is told plainly rather than shown a fake success.
  if (voucherPlan && adminClient) {
    const actor = { userId, label: userEmail };
    try {
      if (voucherPlan.voucher.kind === "promo") {
        await applyPromoRedemption(
          adminClient,
          voucherPlan.voucher,
          voucherPlan.discountPaise,
          order.id,
          actor,
        );
      } else {
        await applyPrepaidRedemption(
          adminClient,
          voucherPlan.voucher,
          voucherPlan.redeemPaise,
          order.id,
          actor,
          "Gift card applied at checkout",
        );
      }
      await logAudit(supabase, {
        actorUserId: userId,
        actorLabel: userEmail,
        action: "voucher.redeem",
        entity: "gift_vouchers",
        entityId: voucherPlan.voucher.id,
        details: {
          orderId: order.id,
          code: voucherPlan.voucher.code,
          kind: voucherPlan.voucher.kind,
          discountPaise: voucherPlan.discountPaise,
          redeemedPaise: voucherPlan.redeemPaise,
        },
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "Your order was placed, but the voucher could not be applied. Please contact us with your order reference and we will sort it out — do not place a second order.",
          orderId: order.id,
          code: "VOUCHER_APPLY_FAILED",
        },
        { status: 500 },
      );
    }
  }

  // COD (or fully voucher-covered): done — pickup is scheduled. With
  // COD, any amount not covered by a gift card is collected at delivery.
  if (isCod || nothingDue) {
    return NextResponse.json(
      {
        mode: "live",
        orderId: order.id,
        status: order.status,
        paymentStatus: order.payment_status,
        totals,
        voucher: voucherSummary,
        finalTotalPaise,
      },
      { status: 201 },
    );
  }

  // Razorpay: create the gateway order server-side (test mode keys) for
  // the amount still due after any gift-card part-payment.
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      {
        mode: "live",
        orderId: order.id,
        status: order.status,
        paymentStatus: order.payment_status,
        totals,
        voucher: voucherSummary,
        finalTotalPaise,
        payment: { gateway: "razorpay", gatewayConfigured: false },
      },
      { status: 201 },
    );
  }

  const gatewayOrder = await createRazorpayOrder({
    amountPaise: amountDuePaise,
    receipt: order.id,
  });
  if (!gatewayOrder) {
    return NextResponse.json(
      {
        error:
          "Your order is saved as payment pending, but online payment could not be started. Please contact us to complete the payment, or place a new order with Pay on Delivery.",
        orderId: order.id,
      },
      { status: 502 },
    );
  }

  await supabase.from("payments").insert({
    order_id: order.id,
    gateway: "razorpay",
    gateway_order_id: gatewayOrder.id,
    amount_paise: amountDuePaise,
    status: "created",
  });

  return NextResponse.json(
    {
      mode: "live",
      orderId: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      totals,
      voucher: voucherSummary,
      finalTotalPaise,
      payment: {
        gateway: "razorpay",
        gatewayConfigured: true,
        gatewayOrderId: gatewayOrder.id,
        amountPaise: amountDuePaise,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    },
    { status: 201 },
  );
}

/** GET /api/orders — the signed-in customer's orders (live mode only). */
export async function GET() {
  const auth = await resolveRequestAuth();
  if (auth.kind === "misconfigured") {
    return notConfiguredResponse();
  }
  if (auth.kind === "unconfigured") {
    return NextResponse.json({ mode: "demo", orders: [] }, { status: 503 });
  }
  if (auth.kind !== "user") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, payment_method, delivery_type, pickup_slot, subtotal_paise, discount_paise, total_paise, created_at, order_items ( qty )",
    )
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Could not load your orders." }, { status: 500 });
  }
  return NextResponse.json({ mode: "live", orders: data ?? [] });
}
