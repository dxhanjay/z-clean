import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { branchCreateSchema } from "@/lib/validation";

/**
 * GET / POST /api/admin/branches — plants, collection centers and
 * branches (Phase 7a, Requirements v2).
 *
 * Live mode only, for a signed-in admin (role verified server-side in
 * getAdminGate; the branches RLS policies are admin-only too). Without
 * Supabase: GET answers the established 503 { mode: "demo" } with an
 * empty list and the admin UI works on the browser demo store; writes
 * answer 503 { mode: "demo" } like every other admin write route.
 * Every live mutation writes an audit_logs row.
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
    return NextResponse.json({ mode: "demo", branches: [] }, { status: 503 });
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { supabase } = gate;
  const { data: branches, error } = await supabase
    .from("branches")
    .select(
      "id, name, type, address, area, pincode, manager_employee_id, active, created_at",
    )
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Could not load branches." }, { status: 500 });
  }

  // Resolve manager display names without a join (the FK is added by a
  // deferred ALTER in schema_v2, so PostgREST has no embed name for it).
  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name");
  const managerName = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  return NextResponse.json({
    mode: "live",
    branches: (branches ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      address: b.address,
      area: b.area,
      pincode: b.pincode,
      managerEmployeeId: b.manager_employee_id,
      managerName: b.manager_employee_id
        ? (managerName.get(b.manager_employee_id) ?? null)
        : null,
      active: b.active,
      createdAt: b.created_at,
    })),
  });
}

export async function POST(request: Request) {
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
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = branchCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const { supabase, user } = gate;

  const { data: branch, error } = await supabase
    .from("branches")
    .insert({
      name: input.name,
      type: input.type,
      address: input.address?.trim() ? input.address.trim() : null,
      area: input.area?.trim() ? input.area.trim() : null,
      pincode: input.pincode?.trim() ? input.pincode.trim() : null,
      manager_employee_id: input.managerEmployeeId ?? null,
      active: input.active ?? true,
    })
    .select("id, name, type, address, area, pincode, manager_employee_id, active, created_at")
    .single();
  if (error || !branch) {
    return NextResponse.json(
      { error: "Could not create the branch. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "branch.create",
    entity: "branches",
    entityId: branch.id,
    details: {
      name: branch.name,
      type: branch.type,
      area: branch.area,
      pincode: branch.pincode,
      managerEmployeeId: branch.manager_employee_id,
      active: branch.active,
    },
  });

  return NextResponse.json(
    {
      mode: "live",
      branch: {
        id: branch.id,
        name: branch.name,
        type: branch.type,
        address: branch.address,
        area: branch.area,
        pincode: branch.pincode,
        managerEmployeeId: branch.manager_employee_id,
        active: branch.active,
        createdAt: branch.created_at,
      },
    },
    { status: 201 },
  );
}
