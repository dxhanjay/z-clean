import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { refundActionSchema } from "@/lib/validation";
import { formatMoneyPaise, paymentMethodLabel } from "@/lib/finance";
import {
  addOrderTimelineNote,
  loadOrderFinance,
  syncOrderPaymentStatus,
} from "@/lib/finance-server";

/**
 * PATCH /api/admin/refunds/[id] — the refund decision workflow (Phase 9).
 *
 *   requested --approve--> approved --process--> processed
 *   requested --reject-->  rejected
 *
 * Approve / reject record the decider and move no money. 'process'
 * (approved only) is the step that hands money back: it writes the
 * payment_entries 'refund' row — for method 'original_payment' the
 * ledger method follows the money's actual origin (the order's gateway
 * rows: razorpay when an online payment exists, otherwise the recorded
 * entry method, defaulting to cash at the desk) — then re-derives the
 * order's payment_status, which becomes 'refunded' exactly when every
 * effective rupee has been returned.
 */
const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  approve: { from: ["requested"], to: "approved" },
  reject: { from: ["requested"], to: "rejected" },
  process: { from: ["approved"], to: "processed" },
};

/** Ledger method for an 'original_payment' refund. */
function originalLedgerMethod(loaded: NonNullable<Awaited<ReturnType<typeof loadOrderFinance>>>): string {
  const gatewayPaid = loaded.gatewayPayments.find((p) => p.status === "paid");
  if (gatewayPaid) return gatewayPaid.gateway === "voucher" ? "voucher" : "razorpay";
  const entryPaid = loaded.entries.find((e) => e.entryType === "payment");
  if (entryPaid) return entryPaid.method;
  return "cash";
}

export async function PATCH(
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
  const parsed = refundActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose approve, reject or process.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const { action } = parsed.data;
  const transition = TRANSITIONS[action];

  const { data: refund, error: loadError } = await supabase
    .from("refunds")
    .select("id, order_id, amount_paise, reason, method, status")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: "Could not load the refund." }, { status: 500 });
  }
  if (!refund) {
    return NextResponse.json({ error: "Refund not found." }, { status: 404 });
  }
  if (!transition.from.includes(refund.status)) {
    return NextResponse.json(
      {
        error: `A refund in status '${refund.status}' cannot move to '${transition.to}'.`,
        code: "INVALID_REFUND_STATE",
        status: refund.status,
      },
      { status: 422 },
    );
  }

  const now = new Date().toISOString();
  let paymentStatus: string | null = null;

  if (action === "process") {
    const loaded = await loadOrderFinance(supabase, refund.order_id);
    if (!loaded) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    // The money must still be there to give back: processed + this
    // refund may not exceed what was effectively paid.
    const stillRefundable =
      loaded.finance.effectivePaidPaise - loaded.finance.refundsProcessedPaise;
    if (refund.amount_paise > stillRefundable) {
      return NextResponse.json(
        {
          error: "This refund can no longer be processed — earlier refunds already returned the money.",
          code: "REFUND_EXCEEDS",
        },
        { status: 422 },
      );
    }

    const ledgerMethod =
      refund.method === "original_payment"
        ? originalLedgerMethod(loaded)
        : refund.method;

    const { error: entryError } = await supabase.from("payment_entries").insert({
      order_id: refund.order_id,
      entry_type: "refund",
      method: ledgerMethod,
      amount_paise: refund.amount_paise,
      reference: null,
      note: `Refund: ${refund.reason}`,
      recorded_by_employee_id: null,
      actor_user_id: user.id,
      actor_label: user.email ?? null,
    });
    if (entryError) {
      return NextResponse.json(
        { error: "The refund entry could not be written. Nothing was processed." },
        { status: 500 },
      );
    }

    const { error: updateError } = await supabase
      .from("refunds")
      .update({
        status: "processed",
        decided_by_label: user.email ?? null,
        decided_at: now,
        processed_at: now,
        updated_at: now,
      })
      .eq("id", id);
    if (updateError) {
      return NextResponse.json(
        {
          error:
            "The refund money was recorded but the refund record could not be updated. Check the order before retrying.",
          code: "REFUND_UPDATE_FAILED",
        },
        { status: 500 },
      );
    }

    const fresh = await loadOrderFinance(supabase, refund.order_id);
    if (fresh) {
      const synced = await syncOrderPaymentStatus(supabase, fresh);
      paymentStatus = synced.paymentStatus;
    }

    await addOrderTimelineNote(
      supabase,
      refund.order_id,
      loaded.order.status,
      `Refund processed — ${formatMoneyPaise(refund.amount_paise)} returned via ${paymentMethodLabel(ledgerMethod)}.`,
      user.id,
    );
  } else {
    const { error: updateError } = await supabase
      .from("refunds")
      .update({
        status: transition.to,
        decided_by_label: user.email ?? null,
        decided_at: now,
        updated_at: now,
      })
      .eq("id", id);
    if (updateError) {
      return NextResponse.json(
        { error: "The refund could not be updated. Please try again." },
        { status: 500 },
      );
    }
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: `refund.${action}`,
    entity: "refunds",
    entityId: id,
    details: {
      orderId: refund.order_id,
      amountPaise: refund.amount_paise,
      method: refund.method,
      fromStatus: refund.status,
      toStatus: transition.to,
      ...(paymentStatus ? { paymentStatus } : {}),
    },
  });

  return NextResponse.json({
    mode: "live",
    refundId: id,
    orderId: refund.order_id,
    status: transition.to,
    ...(paymentStatus ? { paymentStatus } : {}),
  });
}
