import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { settingsUpdateSchema } from "@/lib/validation";

/**
 * GET / PATCH /api/admin/settings — the Business Settings editor
 * (Phase 7b) over the seeded settings table (business_phone,
 * business_whatsapp, business_email, business_address, opening_hours,
 * free_delivery_threshold_paise, minimum_order_paise,
 * first_order_offer_note — see supabase/seed_demo.sql).
 *
 * PATCH only ever updates keys that ALREADY exist in the table; an
 * unknown key is a 422, so the editor can never invent configuration
 * nothing reads. Footer/contact read phone & whatsapp through
 * getBusinessSettings(), so edits show on the site immediately.
 */

type Gate = Awaited<ReturnType<typeof getAdminGate>>;

function gateError(gate: Gate) {
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
  return null;
}

export async function GET() {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { supabase } = gate;

  const { data, error } = await supabase
    .from("settings")
    .select("key, value, updated_at")
    .order("key", { ascending: true });
  if (error || !data) {
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }
  return NextResponse.json({ mode: "live", settings: data });
}

export async function PATCH(request: Request) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;
  const { supabase, user } = gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = settingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const values = parsed.data.values;

  const { data: existing, error: loadError } = await supabase
    .from("settings")
    .select("key, value");
  if (loadError || !existing) {
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }
  const before = new Map(existing.map((r) => [r.key, r.value as string | null]));
  const unknownKeys = Object.keys(values).filter((k) => !before.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      {
        error: `Unknown settings key(s): ${unknownKeys.join(", ")}. Only seeded keys can be edited.`,
        code: "UNKNOWN_SETTINGS_KEY",
        unknownKeys,
      },
      { status: 422 },
    );
  }

  for (const [key, value] of Object.entries(values)) {
    const { error } = await supabase
      .from("settings")
      .update({ value, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) {
      return NextResponse.json(
        { error: `Could not save the "${key}" setting.` },
        { status: 500 },
      );
    }
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "settings.update",
    entity: "settings",
    entityId: null,
    details: {
      changed: Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, { before: before.get(k) ?? null, after: v }]),
      ),
    },
  });

  const { data } = await supabase
    .from("settings")
    .select("key, value, updated_at")
    .order("key", { ascending: true });
  return NextResponse.json({ mode: "live", settings: data ?? [] });
}
