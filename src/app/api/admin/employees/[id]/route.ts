import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { employeeUpdateSchema } from "@/lib/validation";

/**
 * PATCH /api/admin/employees/[id] — edit an employee (Phase 7a):
 * contact details, branch, reporting manager, joining date, the role
 * set (sent roles REPLACE the current set), and activate/deactivate
 * via employment_status. Admin-gated like every admin route; the
 * change is audit-logged with a before/after diff.
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
  const parsed = employeeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const { supabase, user } = gate;

  if (input.managerId === id) {
    return NextResponse.json(
      { error: "An employee cannot be their own reporting manager." },
      { status: 422 },
    );
  }

  const { data: existing, error: loadError } = await supabase
    .from("employees")
    .select(
      "id, employee_code, full_name, phone, email, user_id, branch_id, manager_id, employment_status, joining_date",
    )
    .eq("id", id)
    .maybeSingle();
  if (loadError || !existing) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  const { data: currentRoleRows } = await supabase
    .from("employee_roles")
    .select("role")
    .eq("employee_id", id);
  const currentRoles = (currentRoleRows ?? []).map((r) => r.role as string);

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

  if (input.employeeCode !== undefined && input.employeeCode.trim())
    setField("employee_code", input.employeeCode.trim(), existing.employee_code);
  if (input.fullName !== undefined) setField("full_name", input.fullName, existing.full_name);
  if (input.phone !== undefined) setField("phone", input.phone, existing.phone);
  if (input.email !== undefined)
    setField("email", input.email.trim() ? input.email.trim() : null, existing.email);
  if (input.userId !== undefined) setField("user_id", input.userId, existing.user_id);
  if (input.branchId !== undefined) setField("branch_id", input.branchId, existing.branch_id);
  if (input.managerId !== undefined) setField("manager_id", input.managerId, existing.manager_id);
  if (input.joiningDate !== undefined)
    setField(
      "joining_date",
      input.joiningDate.trim() ? input.joiningDate.trim() : null,
      existing.joining_date,
    );
  if (input.employmentStatus !== undefined)
    setField("employment_status", input.employmentStatus, existing.employment_status);

  const nextRoles = input.roles ? [...new Set(input.roles)] : null;
  const rolesChanged =
    nextRoles !== null &&
    (nextRoles.length !== currentRoles.length ||
      nextRoles.some((r) => !currentRoles.includes(r)));

  if (Object.keys(updates).length === 0 && !rolesChanged) {
    return NextResponse.json(
      { error: "Nothing to change.", code: "NO_CHANGE" },
      { status: 422 },
    );
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", id);
    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: "That employee code is already in use.", code: "DUPLICATE_CODE" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Could not update the employee. Please try again." },
        { status: 500 },
      );
    }
  }

  if (rolesChanged && nextRoles) {
    const { error: deleteError } = await supabase
      .from("employee_roles")
      .delete()
      .eq("employee_id", id);
    if (deleteError) {
      return NextResponse.json(
        { error: "Could not update the employee's roles. Please try again." },
        { status: 500 },
      );
    }
    const { error: insertError } = await supabase
      .from("employee_roles")
      .insert(nextRoles.map((role) => ({ employee_id: id, role })));
    if (insertError) {
      return NextResponse.json(
        { error: "Could not update the employee's roles. Please try again." },
        { status: 500 },
      );
    }
    before.roles = currentRoles;
    after.roles = nextRoles;
  }

  const action =
    after.employment_status === "inactive"
      ? "employee.deactivate"
      : after.employment_status === "active" && before.employment_status === "inactive"
        ? "employee.activate"
        : "employee.update";

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action,
    entity: "employees",
    entityId: id,
    details: { before, after },
  });

  return NextResponse.json({ mode: "live", employeeId: id, changed: after });
}
