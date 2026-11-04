import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import {
  completedPointIds,
  handoverPoint,
  nextHandoverPoint,
  orderItemCount,
  otpIsLocked,
  qrPayload,
} from "@/lib/handovers";

/**
 * GET /api/admin/orders/[id] — full order for the admin detail page:
 * customer profile, address, items, totals, payment, the complete
 * status history, and (Phase 8) the handover chain state: the order's
 * QR payload, OTP *states* (set/used/attempts/locked — the raw codes
 * are the customer's, shown on their own order page; this endpoint
 * never returns them), the recorded handovers with employee names, and
 * the derived next point. Admin-gated exactly like the queue route.
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

  const { supabase } = gate;

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, payment_status, payment_method, delivery_type, pickup_slot, subtotal_paise, discount_paise, total_paise, created_at, voucher_code, voucher_discount_paise, voucher_redeemed_paise, qr_token, pickup_otp, pickup_otp_used_at, delivery_otp, delivery_otp_used_at, otp_attempts, profiles ( name, phone ), addresses ( line, area, city, pincode )",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price_paise, line_total_paise, price_items ( item_name, services ( slug ) )")
    .eq("order_id", id);

  const { data: history } = await supabase
    .from("order_status_history")
    .select("status, note, actor_id, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  // Phase 8: the recorded handover chain + derived next point.
  const { data: handoverRows } = await supabase
    .from("handovers")
    .select(
      "id, point_id, from_stage, to_stage, method, from_employee_id, to_employee_id, quantity, expected_quantity, flags, note, created_at",
    )
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, full_name");
  const employeeName = new Map((employeeRows ?? []).map((e) => [e.id, e.full_name]));
  const handovers = (handoverRows ?? []).map((h) => ({
    id: h.id,
    pointId: h.point_id,
    pointLabel: handoverPoint(h.point_id)?.label ?? h.point_id,
    fromStage: h.from_stage,
    toStage: h.to_stage,
    method: h.method,
    fromEmployeeId: h.from_employee_id,
    fromEmployeeName: h.from_employee_id
      ? (employeeName.get(h.from_employee_id) ?? null)
      : null,
    toEmployeeId: h.to_employee_id,
    toEmployeeName: h.to_employee_id
      ? (employeeName.get(h.to_employee_id) ?? null)
      : null,
    quantity: h.quantity,
    expectedQuantity: h.expected_quantity,
    flags: h.flags ?? [],
    note: h.note,
    at: h.created_at,
  }));
  const nextPoint = nextHandoverPoint(
    order.status,
    completedPointIds(handovers.map((h) => ({ pointId: h.pointId }))),
  );

  // total = subtotal − coupon discount − voucher (promo) discount + fee.
  const deliveryFeePaise =
    order.total_paise -
    (order.subtotal_paise - order.discount_paise - (order.voucher_discount_paise ?? 0));

  // The raw OTP codes belong to the customer (their order page shows
  // them) — strip them from this payload and expose only their state.
  const {
    pickup_otp: _pickupOtp,
    delivery_otp: _deliveryOtp,
    qr_token: qrToken,
    ...orderPublic
  } = order;

  return NextResponse.json({
    mode: "live",
    order: {
      ...orderPublic,
      qr_token: qrToken,
      qr_payload: qrToken ? qrPayload(qrToken) : null,
      item_count: orderItemCount((items ?? []).map((i) => ({ qty: Number(i.qty) }))),
      otp_state: {
        pickupSet: Boolean(order.pickup_otp),
        pickupUsedAt: order.pickup_otp_used_at,
        deliverySet: Boolean(order.delivery_otp),
        deliveryUsedAt: order.delivery_otp_used_at,
        attempts: order.otp_attempts ?? 0,
        locked: otpIsLocked(order.otp_attempts ?? 0),
      },
      handovers,
      next_point: nextPoint,
      delivery_fee_paise: deliveryFeePaise,
      items: (items ?? []).map((row) => {
        const pi = row.price_items as unknown as
          | { item_name: string; services: { slug: string } | { slug: string }[] | null }
          | null;
        const svc = pi ? (Array.isArray(pi.services) ? pi.services[0] : pi.services) : null;
        return {
          itemName: pi?.item_name ?? "Item",
          serviceSlug: svc?.slug ?? "",
          qty: row.qty,
          unitPricePaise: row.unit_price_paise,
          lineTotalPaise: row.line_total_paise,
        };
      }),
      history: (history ?? []).map((h) => ({
        status: h.status,
        note: h.note,
        actorId: h.actor_id,
        at: h.created_at,
      })),
    },
  });
}
