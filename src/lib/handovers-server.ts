import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkHandover,
  handoverPoint,
  nextHandoverPoint,
  completedPointIds,
  orderItemCount,
  type HandoverFlag,
  type HandoverPoint,
} from "./handovers";
import { logAudit } from "./audit";
import { notifyStatusChange } from "./notify";

/**
 * Handover completion — the shared server flow (Staff Web App phase).
 *
 * This is the Phase 8 admin route's logic, extracted unchanged so the
 * admin console and the new staff web app run the IDENTICAL state
 * machine (src/lib/handovers.ts `checkHandover`): sequence, employee
 * role eligibility, OTP/QR verification with the shared attempts
 * counter, quantity flags, status effects through order-flow, COD
 * semantics, history rows, audit trail and the customer notification
 * hook. Callers differ ONLY in how they authenticate and which client
 * they pass:
 *
 *   - Admin route: the caller's RLS client (admins pass is_admin()
 *     policies) after getAdminGate().
 *   - Staff route: the service-role client, after the route has
 *     proven — via the assignment — that this rider is the employee
 *     receiving at this leg's doorstep point. The `toEmployeeId` is
 *     the caller's own linked employee, never client-chosen.
 *
 * The function never throws for expected failures: it returns a
 * verdict the route renders as JSON.
 */

export interface HandoverActor {
  userId: string;
  label: string | null;
}

export interface CompleteHandoverInput {
  orderId: string;
  pointId: string;
  toEmployeeId: string;
  method: string;
  otp?: string | null;
  qrToken?: string | null;
  quantity?: number;
  missingItem?: boolean;
  note?: string | null;
  codCollected?: boolean;
}

export type CompleteHandoverResult =
  | {
      ok: true;
      orderId: string;
      handover: {
        id: string;
        pointId: string;
        flags: HandoverFlag[];
        quantity: number;
        expectedQuantity: number;
        at: string;
      };
      status: string;
      paymentStatus: string;
      nextPoint: HandoverPoint | null;
    }
  | {
      ok: false;
      httpStatus: number;
      error: string;
      code?: string;
      orderId?: string;
      handoverId?: string;
    };

function fail(
  httpStatus: number,
  error: string,
  extra?: { code?: string; orderId?: string; handoverId?: string },
): CompleteHandoverResult {
  return { ok: false, httpStatus, error, ...extra };
}

export async function completeHandover(
  supabase: SupabaseClient,
  actor: HandoverActor,
  input: CompleteHandoverInput,
): Promise<CompleteHandoverResult> {
  const id = input.orderId;

  const point = handoverPoint(input.pointId);
  if (!point) {
    return fail(422, `Unknown handover point "${input.pointId}".`, {
      code: "UNKNOWN_POINT",
    });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, payment_method, qr_token, pickup_otp, pickup_otp_used_at, delivery_otp, delivery_otp_used_at, otp_attempts",
    )
    .eq("id", id)
    .maybeSingle();
  if (orderError || !order) {
    return fail(404, "Order not found.");
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
  let employee: {
    id: string;
    fullName: string;
    employmentStatus: string;
    roles: string[];
  } | null = null;
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

  // COD collection rides the delivery handover only.
  const wantsCod = Boolean(input.codCollected);
  if (wantsCod && point.id !== "delivery") {
    return fail(
      422,
      "COD collection can only be recorded at the delivery handover.",
      { code: "COD_WRONG_POINT" },
    );
  }
  if (
    wantsCod &&
    !(order.payment_method === "cod" && order.payment_status === "cod_pending")
  ) {
    return fail(
      422,
      "COD collection can only be recorded on a Pay-on-Delivery order that is still unpaid.",
      { code: "COD_NOT_PENDING" },
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
        .update({
          otp_attempts: check.otpAttemptsAfter,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      await logAudit(supabase, {
        actorUserId: actor.userId,
        actorLabel: actor.label,
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
    return fail(check.httpStatus, check.error, { code: check.code });
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
      actor_user_id: actor.userId,
      actor_label: actor.label,
      quantity,
      expected_quantity: expectedQuantity,
      flags: check.flags,
      note: cleanNote,
    })
    .select("id, created_at")
    .single();
  if (insertError || !handover) {
    return fail(500, "Could not record the handover. Please try again.");
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
    return fail(
      500,
      "The handover was recorded but the order could not be updated. Please check the order before retrying.",
      { orderId: id, handoverId: handover.id },
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
    actor_id: actor.userId,
  });
  if (wantsCod) {
    historyRows.push({
      order_id: id,
      status: nextStatus,
      note: "COD collected — payment received in full (recorded at the delivery handover).",
      actor_id: actor.userId,
    });
  }
  const { error: historyError } = await supabase
    .from("order_status_history")
    .insert(historyRows);
  if (historyError) {
    return fail(
      500,
      "The handover was recorded but its history could not be saved. Please check the order before retrying.",
      { orderId: id, handoverId: handover.id },
    );
  }

  await logAudit(supabase, {
    actorUserId: actor.userId,
    actorLabel: actor.label,
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

  return {
    ok: true,
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
  };
}
