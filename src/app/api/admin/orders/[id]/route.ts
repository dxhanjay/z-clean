import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";

/**
 * GET /api/admin/orders/[id] — full order for the admin detail page:
 * customer profile, address, items, totals, payment, and the complete
 * status history. Admin-gated exactly like the queue route.
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
      "id, user_id, status, payment_status, payment_method, delivery_type, pickup_slot, subtotal_paise, discount_paise, total_paise, created_at, profiles ( name, phone ), addresses ( line, area, city, pincode )",
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

  const deliveryFeePaise =
    order.total_paise - (order.subtotal_paise - order.discount_paise);

  return NextResponse.json({
    mode: "live",
    order: {
      ...order,
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
