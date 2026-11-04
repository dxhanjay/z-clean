import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { recordPaymentSchema } from "@/lib/validation";
import {
  formatMoneyPaise,
  paymentMethodLabel,
} from "@/lib/finance";
import {
  addOrderTimelineNote,
  loadOrderFinance,
  syncOrderPaymentStatus,
} from "@/lib/finance-server";

/**
 * Order money (Phase 9) — the per-order finance summary and the
 * record-a-payment endpoint.
 *
 * GET returns the gateway rows (Razorpay + gift cards), the staff
 * ledger entries, the refund requests, and the computed summary from
 * src/lib/finance.ts: effective paid, outstanding, refundable, and the
 * legacy-settled flag for v1 orders that were marked paid before the
 * ledger existed.
 *
 * POST records a staff-taken payment (cash / UPI / card machine / bank
 * transfer) into payment_entries. It can never overpay: an amount
 * above the outstanding balance is a 422 OVERPAYMENT, and a settled
 * order is a 422 NOTHING_OUTSTANDING. After the insert the order's
 * payment_status is re-derived ('paid' / 'partially_paid'), a timeline
 * note is written for the customer, and the movement is audit-logged.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await getAdminGate();
  if (gate.kind === "demo") {
    return NextResponse.json({ mode: "demo" }, { status: 503 });
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const loaded = await loadOrderFinance(gate.supabase, id);
  if (!loaded) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  // Employee display names for "recorded by".
  const { data: employeeRows } = await gate.supabase
    .from("employees")
    .select("id, full_name");
  const employeeName = new Map(
    (employeeRows ?? []).map((e) => [e.id, e.full_name]),
  );

  return NextResponse.json({
    mode: "live",
    orderId: id,
    paymentStatus: loaded.order.paymentStatus,
    paymentMethod: loaded.order.paymentMethod,
    orderStatus: loaded.order.status,
    finance: loaded.finance,
    gatewayPayments: loaded.gatewayPayments,
    entries: loaded.entries.map((e) => ({
      ...e,
      recordedByEmployeeName: e.recordedByEmployeeId
        ? (employeeName.get(e.recordedByEmployeeId) ?? null)
        : null,
    })),
    refunds: loaded.refunds,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await getAdminGate();
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
  const parsed = recordPaymentSchema.safeParse(body);
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
  if (loaded.order.status === "CANCELLED") {
    return NextResponse.json(
      { error: "This order is cancelled — payments are not recorded against it.", code: "ORDER_CANCELLED" },
      { status: 422 },
    );
  }
  const outstanding = loaded.finance.outstandingPaise;
  if (outstanding <= 0) {
    return NextResponse.json(
      { error: "This order is already settled — nothing is outstanding.", code: "NOTHING_OUTSTANDING" },
      { status: 422 },
    );
  }
  if (input.amountPaise > outstanding) {
    return NextResponse.json(
      {
        error: `That is more than the ${formatMoneyPaise(outstanding)} outstanding on this order. Record at most the outstanding amount.`,
        code: "OVERPAYMENT",
        outstandingPaise: outstanding,
      },
      { status: 422 },
    );
  }
  if (input.recordedByEmployeeId) {
    const { data: employee } = await supabase
      .from("employees")
      .select("id")
      .eq("id", input.recordedByEmployeeId)
      .maybeSingle();
    if (!employee) {
      return NextResponse.json(
        { error: "The selected employee does not exist.", code: "EMPLOYEE_NOT_FOUND" },
        { status: 422 },
      );
    }
  }

  const { data: entry, error: insertError } = await supabase
    .from("payment_entries")
    .insert({
      order_id: id,
      entry_type: "payment",
      method: input.method,
      amount_paise: input.amountPaise,
      reference: input.reference?.trim() ? input.reference.trim() : null,
      note: input.note?.trim() ? input.note.trim() : null,
      recorded_by_employee_id: input.recordedByEmployeeId ?? null,
      actor_user_id: user.id,
      actor_label: user.email ?? null,
    })
    .select("id")
    .single();
  if (insertError || !entry) {
    return NextResponse.json(
      { error: "The payment could not be recorded. Please try again." },
      { status: 500 },
    );
  }

  const fresh = await loadOrderFinance(supabase, id);
  const synced = fresh
    ? await syncOrderPaymentStatus(supabase, fresh)
    : { paymentStatus: loaded.order.paymentStatus, changed: false };
  const balanceAfter = fresh?.finance.outstandingPaise ?? 0;

  await addOrderTimelineNote(
    supabase,
    id,
    loaded.order.status,
    balanceAfter > 0
      ? `Payment received — ${formatMoneyPaise(input.amountPaise)} via ${paymentMethodLabel(input.method)}. Balance ${formatMoneyPaise(balanceAfter)}.`
      : `Payment received — ${formatMoneyPaise(input.amountPaise)} via ${paymentMethodLabel(input.method)}. Order paid in full.`,
    user.id,
  );

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "payment.record",
    entity: "payment_entries",
    entityId: entry.id,
    details: {
      orderId: id,
      method: input.method,
      amountPaise: input.amountPaise,
      reference: input.reference?.trim() || null,
      recordedByEmployeeId: input.recordedByEmployeeId ?? null,
      outstandingAfterPaise: balanceAfter,
      paymentStatus: synced.paymentStatus,
    },
  });

  return NextResponse.json({
    mode: "live",
    orderId: id,
    entryId: entry.id,
    paymentStatus: synced.paymentStatus,
    finance: fresh?.finance ?? loaded.finance,
  });
}
