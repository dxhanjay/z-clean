import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { branchUpdateSchema } from "@/lib/validation";

/**
 * PATCH /api/admin/branches/[id] — edit a branch / plant / collection
 * center, assign its manager, or toggle it active/inactive (Phase 7a).
 * Admin-gated exactly like the other admin routes; the change is
 * written to audit_logs with a before/after diff of the changed fields.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = branchUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const { supabase, user } = gate;

  const { data: existing, error: loadError } = await supabase
    .from("branches")
    .select("id, name, type, address, area, pincode, manager_employee_id, active")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !existing) {
    return NextResponse.json({ error: "Branch not found." }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  function setField(key: string, next: unknown, current: unknown) {
    if (next !== undefined && next !== current) {
      updates[key] = next;
      before[key] = current;
      after[key] = next;
    }
  }

  if (input.name !== undefined) setField("name", input.name, existing.name);
  if (input.type !== undefined) setField("type", input.type, existing.type);
  if (input.address !== undefined)
    setField("address", input.address.trim() ? input.address.trim() : null, existing.address);
  if (input.area !== undefined)
    setField("area", input.area.trim() ? input.area.trim() : null, existing.area);
  if (input.pincode !== undefined)
    setField("pincode", input.pincode.trim() ? input.pincode.trim() : null, existing.pincode);
  if (input.managerEmployeeId !== undefined)
    setField("manager_employee_id", input.managerEmployeeId, existing.manager_employee_id);
  if (input.active !== undefined) setField("active", input.active, existing.active);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Nothing to change.", code: "NO_CHANGE" },
      { status: 422 },
    );
  }
  updates.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("branches")
    .update(updates)
    .eq("id", id);
  if (updateError) {
    return NextResponse.json(
      { error: "Could not update the branch. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "branch.update",
    entity: "branches",
    entityId: id,
    details: { before, after },
  });

  return NextResponse.json({ mode: "live", branchId: id, changed: after });
}
