import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { refundRequestSchema } from "@/lib/validation";
import { formatMoneyPaise } from "@/lib/finance";
import { loadOrderFinance } from "@/lib/finance-server";

/**
 * POST /api/admin/orders/[id]/refunds — open a refund REQUEST (Phase 9).
 *
 * A request moves NO money. It reserves refundable headroom (the pure
 * math in src/lib/finance.ts subtracts requested + approved refunds
 * from what's refundable) until an admin approves or rejects it in
 * PATCH /api/admin/refunds/[id]; only the 'process' step there writes
 * the ledger entry that hands the money back.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json(
      { mode: "demo", message: "Supabase not configured — demo mode." },
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = refundRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const loaded = await loadOrderFinance(supabase, id);
  if (!loaded) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (input.amountPaise > loaded.finance.refundablePaise) {
    return NextResponse.json(
      {
        error:
          loaded.finance.refundablePaise <= 0
            ? "Nothing on this order is refundable — either nothing was paid, or earlier refunds already cover it."
            : `That is more than the ${formatMoneyPaise(loaded.finance.refundablePaise)} still refundable on this order.`,
        code: "REFUND_EXCEEDS",
        refundablePaise: loaded.finance.refundablePaise,
      },
      { status: 422 },
    );
  }

  const { data: refund, error } = await supabase
    .from("refunds")
    .insert({
      order_id: id,
      amount_paise: input.amountPaise,
      reason: input.reason.trim(),
      method: input.method,
      status: "requested",
      requested_by_user_id: user.id,
      requested_by_label: user.email ?? null,
    })
    .select("id")
    .single();
  if (error || !refund) {
    return NextResponse.json(
      { error: "The refund request could not be created. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "refund.request",
    entity: "refunds",
    entityId: refund.id,
    details: {
      orderId: id,
      amountPaise: input.amountPaise,
      method: input.method,
      reason: input.reason.trim(),
    },
  });

  return NextResponse.json({
    mode: "live",
    orderId: id,
    refundId: refund.id,
    status: "requested",
    refundablePaise: loaded.finance.refundablePaise - input.amountPaise,
  });
}
