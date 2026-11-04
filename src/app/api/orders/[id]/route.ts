import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/orders/[id] — one of the signed-in customer's orders with its
 * items (RLS restricts rows to the owner) and, since Phase 4, its full
 * status history for the tracking timeline. The orders table stores
 * subtotal / discount / total; the delivery fee is exactly recoverable as
 * total − (subtotal − discount) because totals are computed that way by
 * the shared engine in src/lib/totals.ts.
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
      "id, status, payment_status, payment_method, delivery_type, pickup_slot, subtotal_paise, discount_paise, total_paise, created_at, coupon_id, voucher_code, voucher_discount_paise, voucher_redeemed_paise, addresses ( line, area, city, pincode )",
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

  return NextResponse.json({
    mode: "live",
    order: {
      ...order,
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
