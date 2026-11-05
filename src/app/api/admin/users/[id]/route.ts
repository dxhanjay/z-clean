import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { roleChangeSchema } from "@/lib/validation";
import { canChangeRole } from "@/lib/roles";

/**
 * PATCH /api/admin/users/[id] { role } — change an account's tier
 * (Delta 1). SUPER_ADMIN ONLY — the one power that separates the top
 * tier from admin. The guard rules live in src/lib/roles.ts
 * (canChangeRole, unit-tested): no self-demotion, and the last
 * super_admin can never be demoted (409 LAST_SUPER_ADMIN), so the
 * business always keeps one account able to manage roles. Every
 * change is audit-logged as user.role_change { from, to }.
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const roleErr = roleGateError(gate, "super_admin");
  if (roleErr) return roleErr;
  const { supabase, user } = gate;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = roleChangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please fix the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }
  const newRole = parsed.data.role;

  const { data: target, error: loadError } = await supabase
    .from("profiles")
    .select("id, name, role, disabled")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: "Could not load the account." }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const { count: superCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");

  const verdict = canChangeRole({
    actorRole: gate.role,
    actorId: user.id,
    targetId: id,
    targetCurrentRole: target.role as string,
    newRole,
    superAdminCount: superCount ?? 0,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.code, message: verdict.message },
      { status: verdict.code === "FORBIDDEN_ROLE" ? 403 : 409 },
    );
  }

  if (target.role === newRole) {
    // No-op: already at the requested tier. Nothing to write or audit.
    return NextResponse.json({
      mode: "live",
      user: {
        id: target.id,
        name: target.name,
        role: target.role,
        disabled: Boolean(target.disabled),
      },
    });
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, role, disabled")
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: "Could not change the role." }, { status: 500 });
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "user.role_change",
    entity: "profiles",
    entityId: id,
    details: {
      from: target.role,
      to: newRole,
      targetName: target.name ?? null,
    },
  });

  return NextResponse.json({
    mode: "live",
    user: {
      id: updated.id,
      name: updated.name,
      role: updated.role,
      disabled: Boolean(updated.disabled),
    },
  });
}
