import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/users?q= — team accounts for the Settings "Team &
 * Roles" card (Delta 1). Admin tier and up: an ops_manager never
 * sees the account list, and only a super_admin may CHANGE roles
 * (PATCH /api/admin/users/[id]).
 *
 * Profiles carry name / phone / role / disabled; the EMAIL lives in
 * Supabase Auth, so it is merged in from the service-role client
 * (auth.admin.listUsers, bounded at 5,000 accounts). Without the
 * service-role key the list still answers, with email = null —
 * role management keeps working, the card just cannot show emails.
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

/** id → email for every auth account, bounded (5 pages × 1000). */
async function loadEmailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const admin = createAdminClient();
  if (!admin) return map;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data) break;
    for (const u of data.users) {
      if (u.email) map.set(u.id, u.email);
    }
    if (data.users.length < 1000) break;
  }
  return map;
}

export async function GET(request: Request) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;
  const { supabase } = gate;

  const q = (new URL(request.url).searchParams.get("q") ?? "")
    .trim()
    .toLowerCase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, phone, role, disabled, created_at")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error || !data) {
    return NextResponse.json({ error: "Could not load accounts." }, { status: 500 });
  }

  const emails = await loadEmailMap();
  let users = data.map((p) => ({
    id: p.id as string,
    name: (p.name as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    email: emails.get(p.id as string) ?? null,
    role: p.role as string,
    disabled: Boolean(p.disabled),
    createdAt: p.created_at as string,
  }));
  if (q) {
    users = users.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q),
    );
  }
  return NextResponse.json({ mode: "live", users });
}
