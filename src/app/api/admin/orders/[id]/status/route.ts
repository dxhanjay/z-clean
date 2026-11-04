import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { adminStatusUpdateSchema } from "@/lib/validation";
import { canTransition, nextStatuses } from "@/lib/order-flow";
import { notifyStatusChange } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

/**
 * PATCH /api/admin/orders/[id]/status — admin status update (Phase 4).
 *
 * Rules enforced here, server-side, in order:
 *   1. Live mode requires a signed-in user whose profiles.role is
 *      'admin' (verified in getAdminGate — RLS alone is not the gate).
 *      Without Supabase: the established 503 { mode: "demo" }, and the
 *      client applies the same rules to the demo store instead.
 *   2. A status change must be legal per src/lib/order-flow.ts —
 *      illegal moves (skips, backwards, cancel after pickup, moves out
 *      of a terminal state) get 422 INVALID_TRANSITION with the list of
 *      statuses that ARE allowed.
 *   3. `codCollected: true` records a Pay-on-Delivery collection: only
 *      for a COD order still at payment_status 'cod_pending'. It may
 *      ride along with a status change (e.g. -> DELIVERED) or stand
 *      alone (body.status omitted / equal to the current status).
 *   4. The order row and its order_status_history rows are written in
 *      this one request (status-change row + a separate COD-collection
 *      audit row when applicable), actor = the admin's user id, and the
 *      notification hook fires once the writes succeed.
 */
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = adminStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }
  const { status: requestedStatus, note, codCollected } = parsed.data;
  const cleanNote = note?.trim() ? note.trim() : null;

  const { supabase, user } = gate;

  const { data: order, error: loadError } = await supabase
    .from("orders")
    .select("id, status, payment_status, payment_method, total_paise")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const wantsStatusChange =
    requestedStatus !== undefined && requestedStatus !== order.status;
  if (requestedStatus !== undefined && requestedStatus === order.status && !codCollected) {
    return NextResponse.json(
      { error: "Pick a new status, or record the COD collection.", code: "NO_CHANGE" },
      { status: 422 },
    );
  }
  if (!wantsStatusChange && !codCollected) {
    return NextResponse.json(
      { error: "Nothing to change.", code: "NO_CHANGE" },
      { status: 422 },
    );
  }
  if (wantsStatusChange && !canTransition(order.status, requestedStatus!)) {
    return NextResponse.json(
      {
        error: `An order cannot move from ${order.status} to ${requestedStatus}.`,
        code: "INVALID_TRANSITION",
        allowed: nextStatuses(order.status),
      },
      { status: 422 },
    );
  }
  if (
    codCollected &&
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

  const nextStatus = wantsStatusChange ? requestedStatus! : order.status;

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: nextStatus,
      ...(codCollected ? { payment_status: "paid" } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json(
      { error: "Could not update the order. Please try again." },
      { status: 500 },
    );
  }

  const historyRows: {
    order_id: string;
    status: string;
    note: string | null;
    actor_id: string;
  }[] = [];
  if (wantsStatusChange) {
    historyRows.push({
      order_id: id,
      status: nextStatus,
      note: cleanNote,
      actor_id: user.id,
    });
  }
  if (codCollected) {
    historyRows.push({
      order_id: id,
      status: nextStatus,
      note: `COD collected — payment received in full (marked by admin).`,
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
          "The order was updated but its history could not be recorded. Please check the order before retrying.",
        orderId: id,
      },
      { status: 500 },
    );
  }

  // Audit trail (P0): status changes also land in audit_logs (in
  // addition to order_status_history above), so the admin activity
  // feed covers the most common staff action. logAudit never throws.
  if (wantsStatusChange) {
    await logAudit(supabase, {
      actorUserId: user.id,
      actorLabel: user.email ?? null,
      action: "order.status_change",
      entity: "orders",
      entityId: id,
      details: { from: order.status, to: nextStatus },
    });
  }

  await notifyStatusChange({
    orderId: id,
    status: nextStatus,
    note: cleanNote,
    paymentStatus: codCollected ? "paid" : order.payment_status,
    codCollected: Boolean(codCollected),
  });

  return NextResponse.json({
    mode: "live",
    orderId: id,
    status: nextStatus,
    paymentStatus: codCollected ? "paid" : order.payment_status,
  });
}
