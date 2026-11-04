import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { handoverCompleteSchema } from "@/lib/validation";
import {
  checkHandover,
  handoverPoint,
  nextHandoverPoint,
  completedPointIds,
  orderItemCount,
} from "@/lib/handovers";
import { logAudit } from "@/lib/audit";
import { notifyStatusChange } from "@/lib/notify";

/**
 * POST /api/admin/orders/[id]/handover — complete one QR/OTP handover
 * (Phase 8, Requirements v2 §2/§3).
 *
 * Staff have no separate login yet (Phase 7a decision): the operator
 * works from this admin console and SELECTS the employee who is
 * physically receiving the items (`toEmployeeId`). Everything else is
 * enforced here, server-side, via the shared pure validator in
 * src/lib/handovers.ts (`checkHandover` — the demo mode applier runs
 * the exact same function):
 *
 *   1. Sequence: the point must be the order's next expected point
 *      (derived from status + recorded handovers — no current-point
 *      column). Already-done → 409 DUPLICATE; anything else →
 *      409 OUT_OF_SEQUENCE.
 *   2. Employee: must exist, be active (409 EMPLOYEE_INACTIVE) and hold
 *      the point's receiving role (422 ROLE_MISMATCH).
 *   3. Verification: OTP points compare against the order's stored OTP
 *      for that point (wrong → 422 OTP_MISMATCH, the shared attempts
 *      counter is incremented and the failure audit-logged; 5 failures
 *      → 423 OTP_LOCKED until an admin regenerates). QR points require
 *      the scanned/pasted token to equal orders.qr_token
 *      (422 QR_MISMATCH — the "wrong bag" guard).
 *   4. Quantity defaults to the order's total item count; a different
 *      count completes WITH a quantity_mismatch flag (the plan's rule:
 *      flag, don't block). `missingItem: true` adds the missing_item
 *      flag the same way.
 *   5. A point's status effect is applied ONLY through the canonical
 *      order-flow rules (same history rows + notification hook as the
 *      admin status route) — handovers never invent a status move.
 *      On the delivery point, `codCollected: true` records the COD
 *      collection with exactly the status route's semantics.
 *
 * Failed OTP attempts do NOT create handover rows (the ledger holds
 * completed transfers only) — they are audit-logged instead.
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = handoverCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const point = handoverPoint(input.pointId);
  if (!point) {
    return NextResponse.json(
      { error: `Unknown handover point "${input.pointId}".`, code: "UNKNOWN_POINT" },
      { status: 422 },
    );
  }

  const { supabase, user } = gate;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, payment_method, qr_token, pickup_otp, pickup_otp_used_at, delivery_otp, delivery_otp_used_at, otp_attempts",
    )
    .eq("id", id)
    .maybeSingle();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: handoverRows } = await supabase
    .from("handovers")
    .select("point_id, to_employee_id")
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  const priorHandovers = (handoverRows ?? []).map((h) => ({
    pointId: h.point_id as string,
    toEmployeeId: h.to_employee_id as string | null,
  }));
  const completed = completedPointIds(priorHandovers);

  const { data: itemRows } = await supabase
    .from("order_items")
    .select("qty")
    .eq("order_id", id);
  const expectedQuantity = orderItemCount(
    (itemRows ?? []).map((r) => ({ qty: Number(r.qty) })),
  );
  const quantity = input.quantity ?? expectedQuantity;

  // The receiving employee + their roles (employee_roles is the matrix).
  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, full_name, employment_status")
    .eq("id", input.toEmployeeId)
    .maybeSingle();
  let employee: { id: string; fullName: string; employmentStatus: string; roles: string[] } | null =
    null;
  if (employeeRow) {
    const { data: roleRows } = await supabase
      .from("employee_roles")
      .select("role")
      .eq("employee_id", employeeRow.id);
    employee = {
      id: employeeRow.id,
      fullName: employeeRow.full_name,
      employmentStatus: employeeRow.employment_status,
      roles: (roleRows ?? []).map((r) => r.role as string),
    };
  }

  // COD collection rides the delivery handover only, with the same
  // semantics as the admin status route.
  const wantsCod = Boolean(input.codCollected);
  if (wantsCod && point.id !== "delivery") {
    return NextResponse.json(
      {
        error: "COD collection can only be recorded at the delivery handover.",
        code: "COD_WRONG_POINT",
      },
      { status: 422 },
    );
  }
  if (
    wantsCod &&
    !(order.payment_method === "cod" && order.payment_status === "cod_pending")
  ) {
    return NextResponse.json(
      {
        error:
          "COD collection can only be recorded on a Pay-on-Delivery order that is still unpaid.",
        code: "COD_NOT_PENDING",
      },
      { status: 422 },
    );
  }

  const check = checkHandover({
    point,
    orderStatus: order.status,
    completedPointIds: completed,
    employee,
    method: input.method,
    otpProvided: input.otp || null,
    storedOtp:
      point.otpKind === "pickup"
        ? order.pickup_otp
        : point.otpKind === "delivery"
          ? order.delivery_otp
          : null,
    otpAlreadyUsed:
      point.otpKind === "pickup"
        ? Boolean(order.pickup_otp_used_at)
        : point.otpKind === "delivery"
          ? Boolean(order.delivery_otp_used_at)
          : false,
    otpAttempts: order.otp_attempts ?? 0,
    qrProvided: input.qrToken || null,
    storedQrToken: order.qr_token,
    quantity,
    expectedQuantity,
    reportMissingItem: Boolean(input.missingItem),
  });

  if (check.ok === false) {
    // A wrong OTP is a real event: persist the incremented shared
    // counter and audit-log the failure. No handover row is written —
    // the ledger records completed transfers only.
    if (check.code === "OTP_MISMATCH" && check.otpAttemptsAfter !== undefined) {
      await supabase
        .from("orders")
        .update({ otp_attempts: check.otpAttemptsAfter, updated_at: new Date().toISOString() })
        .eq("id", id);
      await logAudit(supabase, {
        actorUserId: user.id,
        actorLabel: user.email ?? null,
        action: "handover.otp_failed",
        entity: "orders",
        entityId: id,
        details: {
          pointId: point.id,
          toEmployeeId: input.toEmployeeId,
          attemptsAfter: check.otpAttemptsAfter,
        },
      });
    }
    return NextResponse.json(
      { error: check.error, code: check.code },
      { status: check.httpStatus },
    );
  }

  // Who hands over: the previous point's receiver (the picker at
  // picker_to_centre, the packer at packer_to_outbound, …). At pickup
  // the customer hands over, so there is no from-employee.
  const chainIndex = priorHandovers.length;
  const fromEmployeeId =
    chainIndex > 0 ? (priorHandovers[chainIndex - 1].toEmployeeId ?? null) : null;

  const cleanNote = input.note?.trim() ? input.note.trim() : null;
  const nowIso = new Date().toISOString();

  const { data: handover, error: insertError } = await supabase
    .from("handovers")
    .insert({
      order_id: id,
      point_id: point.id,
      from_stage: point.fromLabel,
      to_stage: point.toLabel,
      method: point.method,
      from_employee_id: fromEmployeeId,
      to_employee_id: employee!.id,
      actor_user_id: user.id,
      actor_label: user.email ?? null,
      quantity,
      expected_quantity: expectedQuantity,
      flags: check.flags,
      note: cleanNote,
    })
    .select("id, created_at")
    .single();
  if (insertError || !handover) {
    return NextResponse.json(
      { error: "Could not record the handover. Please try again." },
      { status: 500 },
    );
  }

  // Apply the order-side effects: OTP consumption, the status effect
  // (already proven legal by checkHandover + canTransition), COD.
  const nextStatus = check.statusEffect ?? order.status;
  const orderUpdate: Record<string, unknown> = { updated_at: nowIso };
  if (check.statusEffect) orderUpdate.status = check.statusEffect;
  if (point.otpKind === "pickup") orderUpdate.pickup_otp_used_at = nowIso;
  if (point.otpKind === "delivery") orderUpdate.delivery_otp_used_at = nowIso;
  if (wantsCod) orderUpdate.payment_status = "paid";

  const { error: updateError } = await supabase
    .from("orders")
    .update(orderUpdate)
    .eq("id", id);
  if (updateError) {
    return NextResponse.json(
      {
        error:
          "The handover was recorded but the order could not be updated. Please check the order before retrying.",
        orderId: id,
        handoverId: handover.id,
      },
      { status: 500 },
    );
  }

  // History rows in the status route's style: one for the status move
  // (or a handover note row when the point carries no status effect),
  // plus the COD-collection audit row when applicable.
  const historyRows: {
    order_id: string;
    status: string;
    note: string | null;
    actor_id: string;
  }[] = [];
  const handoverNote =
    `Handover — ${point.label}: ${point.fromLabel} → ${employee!.fullName} (${point.toLabel}), ` +
    `${quantity} item${quantity === 1 ? "" : "s"} via ${point.method === "otp" ? "customer OTP" : "QR scan"}` +
    (check.flags.length ? ` [flags: ${check.flags.join(", ")}]` : "") +
    (cleanNote ? ` — ${cleanNote}` : "");
  historyRows.push({
    order_id: id,
    status: nextStatus,
    note: handoverNote,
    actor_id: user.id,
  });
  if (wantsCod) {
    historyRows.push({
      order_id: id,
      status: nextStatus,
      note: "COD collected — payment received in full (recorded at the delivery handover).",
      actor_id: user.id,
    });
  }
  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert(historyRows);
  if (historyError) {
    return NextResponse.json(
      {
        error:
          "The handover was recorded but its history could not be saved. Please check the order before retrying.",
        orderId: id,
        handoverId: handover.id,
      },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "handover.complete",
    entity: "handovers",
    entityId: handover.id,
    details: {
      orderId: id,
      pointId: point.id,
      method: point.method,
      fromEmployeeId,
      toEmployeeId: employee!.id,
      toEmployeeName: employee!.fullName,
      quantity,
      expectedQuantity,
      flags: check.flags,
      statusEffect: check.statusEffect,
      codCollected: wantsCod,
    },
  });

  if (check.statusEffect || wantsCod) {
    await notifyStatusChange({
      orderId: id,
      status: nextStatus,
      note: cleanNote,
      paymentStatus: wantsCod ? "paid" : order.payment_status,
      codCollected: wantsCod,
    });
  }

  const next = nextHandoverPoint(
    nextStatus,
    completedPointIds([...priorHandovers, { pointId: point.id }]),
  );

  return NextResponse.json({
    mode: "live",
    orderId: id,
    handover: {
      id: handover.id,
      pointId: point.id,
      flags: check.flags,
      quantity,
      expectedQuantity,
      at: handover.created_at,
    },
    status: nextStatus,
    paymentStatus: wantsCod ? "paid" : order.payment_status,
    nextPoint: next,
  });
}
