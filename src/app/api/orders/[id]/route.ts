import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handoverPoint, qrPayload } from "@/lib/handovers";

/**
 * GET /api/orders/[id] — one of the signed-in customer's orders with its
 * items (RLS restricts rows to the owner) and, since Phase 4, its full
 * status history for the tracking timeline. The orders table stores
 * subtotal / discount / total; the delivery fee is exactly recoverable as
 * total − (subtotal − discount) because totals are computed that way by
 * the shared engine in src/lib/totals.ts.
 *
 * Phase 8: the owner — and only the owner, this route is RLS-scoped to
 * them — also gets their handover credentials: the QR payload and the
 * pickup/delivery OTPs (each returned only until it is used). OTPs of
 * OTHER customers are unreachable here by construction. The handover
 * milestones are composed server-side through the service-role client
 * (the handovers table is admin-only under RLS) AFTER the owner check
 * above, and deliberately contain NO employee names or ids — point and
 * role labels only.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ mode: "demo" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, payment_method, delivery_type, pickup_slot, subtotal_paise, discount_paise, total_paise, created_at, coupon_id, voucher_code, voucher_discount_paise, voucher_redeemed_paise, qr_token, pickup_otp, pickup_otp_used_at, delivery_otp, delivery_otp_used_at, addresses ( line, area, city, pincode )",
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
    .select("status, note, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  // total = subtotal − coupon discount − voucher (promo) discount + fee.
  // A prepaid gift card is a payment, not a discount: it never enters
  // this identity.
  const deliveryFeePaise =
    order.total_paise -
    (order.subtotal_paise - order.discount_paise - (order.voucher_discount_paise ?? 0));

  // Phase 8 milestones — name-free by design (see the header comment).
  let handoverMilestones: {
    pointId: string;
    label: string;
    fromLabel: string;
    toLabel: string;
    method: string;
    quantity: number;
    flags: string[];
    at: string;
  }[] = [];
  const adminClient = createAdminClient();
  if (adminClient) {
    const { data: handoverRows } = await adminClient
      .from("handovers")
      .select("point_id, method, quantity, flags, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true });
    handoverMilestones = (handoverRows ?? []).map((h) => {
      const point = handoverPoint(h.point_id);
      return {
        pointId: h.point_id,
        label: point?.customerLabel ?? h.point_id,
        fromLabel: point?.fromLabel ?? "",
        toLabel: point?.toLabel ?? "",
        method: h.method,
        quantity: h.quantity,
        flags: h.flags ?? [],
        at: h.created_at,
      };
    });
  }

  // The raw token stays server-side; the customer gets the payload to
  // render as a QR code, and each OTP only until it has been used.
  const { qr_token: qrToken, ...orderRest } = order;

  return NextResponse.json({
    mode: "live",
    order: {
      ...orderRest,
      qr_payload: qrToken ? qrPayload(qrToken) : null,
      pickup_otp: order.pickup_otp_used_at ? null : order.pickup_otp,
      delivery_otp: order.delivery_otp_used_at ? null : order.delivery_otp,
      handover_milestones: handoverMilestones,
      delivery_fee_paise: deliveryFeePaise,
      history: (history ?? []).map((h) => ({
        status: h.status,
        note: h.note,
        at: h.created_at,
      })),
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
    },
  });
}
