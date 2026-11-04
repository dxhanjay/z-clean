import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { UNIT_LABELS } from "@/lib/catalogue-server";

/**
 * GET /api/admin/pricing — the FULL catalogue for the pricing editor
 * (Phase 7b): every service and price item, including inactive ones
 * (the admin SELECT policies include is_admin()). Edits go through
 * PATCH /api/admin/pricing/[id] and take effect immediately because
 * the storefront and the order API both read the catalogue DB-first.
 */
export async function GET() {
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
  const { supabase } = gate;

  // Column reality (verified against the live schema): services has NO
  // sort_order; price_items uses item_name and has NO unit/unit_label/
  // sort_order columns — the unit lives on services.pricing_unit.
  const { data: serviceRows, error } = await supabase
    .from("services")
    .select("id, slug, name, pricing_unit")
    .order("name", { ascending: true });
  if (error || !serviceRows) {
    return NextResponse.json({ error: "Could not load the catalogue." }, { status: 500 });
  }
  const { data: itemRows, error: itemsError } = await supabase
    .from("price_items")
    .select("id, service_id, item_name, price_paise, express_multiplier, active")
    .order("item_name", { ascending: true });
  if (itemsError || !itemRows) {
    return NextResponse.json({ error: "Could not load price items." }, { status: 500 });
  }

  const unitByService = new Map(serviceRows.map((s) => [s.id, s.pricing_unit]));
  const groups = serviceRows.map((s) => ({
    serviceId: s.id,
    slug: s.slug,
    title: s.name,
    items: itemRows
      .filter((i) => i.service_id === s.id)
      .map((i) => ({
        id: i.id,
        name: i.item_name,
        pricePaise: i.price_paise,
        unit: unitByService.get(i.service_id) ?? "piece",
        unitLabel: UNIT_LABELS[unitByService.get(i.service_id) ?? "piece"] ?? "per piece",
        expressMultiplier: Number(i.express_multiplier),
        active: i.active,
      })),
  }));

  return NextResponse.json({ mode: "live", groups });
}
