import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { pricingUpdateSchema } from "@/lib/validation";

/**
 * PATCH /api/admin/pricing/[id] — edit one price item (price, express
 * multiplier, active flag). Admin-gated, validated, audited. Because
 * the storefront and checkout read the catalogue DB-first, the change
 * is live everywhere as soon as it saves — there is no second copy.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = pricingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const { data: existing, error: loadError } = await supabase
    .from("price_items")
    .select("id, name, price_paise, express_multiplier, active, services ( slug, name )")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: "Could not load the price item." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Price item not found." }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (input.pricePaise !== undefined) update.price_paise = input.pricePaise;
  if (input.expressMultiplier !== undefined) update.express_multiplier = input.expressMultiplier;
  if (input.active !== undefined) update.active = input.active;

  const { data: updated, error } = await supabase
    .from("price_items")
    .update(update)
    .eq("id", id)
    .select("id, name, price_paise, express_multiplier, active, unit_label")
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: "Could not save the price change." }, { status: 500 });
  }

  const service = (existing as { services?: { slug?: string; name?: string } | null }).services;
  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "pricing.update",
    entity: "price_items",
    entityId: id,
    details: {
      item: existing.name,
      service: service?.slug ?? null,
      before: {
        pricePaise: existing.price_paise,
        expressMultiplier: Number(existing.express_multiplier),
        active: existing.active,
      },
      after: {
        pricePaise: updated.price_paise,
        expressMultiplier: Number(updated.express_multiplier),
        active: updated.active,
      },
    },
  });

  return NextResponse.json({
    mode: "live",
    item: {
      id: updated.id,
      name: updated.name,
      pricePaise: updated.price_paise,
      unitLabel: updated.unit_label,
      expressMultiplier: Number(updated.express_multiplier),
      active: updated.active,
    },
  });
}
