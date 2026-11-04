import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";

/**
 * GET /api/admin/orders — the admin order queue (Phase 4), plus the
 * pickup-request list from Phase 2.
 *
 * Live mode only, and only for a signed-in user whose profiles.role is
 * 'admin' — the role is verified server-side in getAdminGate (not just
 * left to RLS), and the admin RLS policies are what let the reads see
 * every customer's rows. Without Supabase this returns the established
 * 503 { mode: "demo" } and the admin UI works on the browser demo store.
 */
export async function GET() {
  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json({ mode: "demo", orders: [], pickups: [] }, { status: 503 });
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { supabase } = gate;

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, payment_method, delivery_type, pickup_slot, subtotal_paise, discount_paise, total_paise, created_at, profiles ( name, phone ), addresses ( line, area, city, pincode ), order_items ( qty )",
    )
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }

  const { data: pickups } = await supabase
    .from("pickup_requests")
    .select(
      "id, name, phone, address_line, area, city, pincode, services, pickup_slot, delivery_type, note, status, created_at",
    )
    .order("created_at", { ascending: false });

  return NextResponse.json({
    mode: "live",
    orders: orders ?? [],
    pickups: pickups ?? [],
  });
}
