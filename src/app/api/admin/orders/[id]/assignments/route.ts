import { NextResponse } from "next/server";
import { getAdminGate, roleGateError, type AdminGate } from "@/lib/admin";
import {
  assignmentCreateSchema,
  assignmentUpdateSchema,
} from "@/lib/validation";
import { canAssignEmployee, isAssignmentActive } from "@/lib/tracking";
import { logAudit } from "@/lib/audit";

/**
 * Order leg assignments (Staff Web App phase) — schema_v10
 * `order_assignments`. An assignment is what makes an order appear in
 * a rider's staff app and opens their location-ping gate; it closes
 * when the leg's handover completes (or an admin completes it here).
 *
 *   GET   — the order's assignments (active first, then history) and
 *           the eligible employees per leg, so the admin order page
 *           needs no second round-trip. Any admin tier may view.
 *   POST  — assign a leg (ops_manager+). Replaces the leg's active
 *           assignment if one exists (the old row is completed, the
 *           new one inserted — the partial unique index backs this).
 *   PATCH — reassign (employeeId) or close without a handover
 *           (action: "complete"), ops_manager+. Normal completion
 *           stays handover-driven; "complete" is the admin override
 *           for a leg that will not run (order cancelled, rider
 *           unavailable) and is audit-logged as such.
 *
 * Eligibility is the pure rule in src/lib/tracking.ts (active +
 * the leg's handover-chain receiving role) — the same rule the
 * handover itself re-checks at completion time.
 */

type GateOk = Extract<AdminGate, { kind: "ok" }>;

function gateError(gate: AdminGate): NextResponse | null {
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

interface EmployeeWithRoles {
  id: string;
  fullName: string;
  employmentStatus: string;
  roles: string[];
}

async function loadEmployeesWithRoles(
  gate: GateOk,
): Promise<EmployeeWithRoles[]> {
  const { data: rows } = await gate.supabase
    .from("employees")
    .select("id, full_name, employment_status")
    .order("full_name", { ascending: true });
  const { data: roleRows } = await gate.supabase
    .from("employee_roles")
    .select("employee_id, role");
  const rolesByEmployee = new Map<string, string[]>();
  for (const r of roleRows ?? []) {
    const list = rolesByEmployee.get(r.employee_id as string) ?? [];
    list.push(r.role as string);
    rolesByEmployee.set(r.employee_id as string, list);
  }
  return (rows ?? []).map((e) => ({
    id: e.id as string,
    fullName: e.full_name as string,
    employmentStatus: e.employment_status as string,
    roles: rolesByEmployee.get(e.id as string) ?? [],
  }));
}

function assignmentJson(row: Record<string, unknown>, name: string | null) {
  return {
    id: row.id,
    leg: row.leg,
    employeeId: row.employee_id,
    employeeName: name,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
    active: isAssignmentActive({
      completedAt: (row.completed_at as string | null) ?? null,
    }),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  const ok = gate as GateOk;
  const { supabase } = ok;

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("order_assignments")
    .select("id, leg, employee_id, assigned_by, assigned_at, completed_at")
    .eq("order_id", id)
    .order("assigned_at", { ascending: false });

  const employees = await loadEmployeesWithRoles(ok);
  const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

  const assignments = (rows ?? []).map((r) =>
    assignmentJson(
      r as Record<string, unknown>,
      nameById.get(r.employee_id as string) ?? null,
    ),
  );

  const eligibleFor = (leg: "pickup" | "delivery") =>
    employees
      .filter(
        (e) =>
          canAssignEmployee({
            leg,
            employmentStatus: e.employmentStatus,
            roles: e.roles,
          }).ok,
      )
      .map((e) => ({ id: e.id, fullName: e.fullName, roles: e.roles }));

  return NextResponse.json({
    mode: "live",
    orderId: id,
    assignments,
    eligible: { pickup: eligibleFor("pickup"), delivery: eligibleFor("delivery") },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  const roleErr = roleGateError(gate, "ops_manager");
  if (roleErr) return roleErr;
  const ok = gate as GateOk;
  const { supabase, user } = ok;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = assignmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const { leg, employeeId } = parsed.data;

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const employees = await loadEmployeesWithRoles(ok);
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  const verdict = canAssignEmployee({
    leg,
    employmentStatus: employee.employmentStatus,
    roles: employee.roles,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.message, code: verdict.code },
      { status: verdict.code === "EMPLOYEE_INACTIVE" ? 409 : 422 },
    );
  }

  // Replace the leg's active assignment, if any.
  const { data: current } = await supabase
    .from("order_assignments")
    .select("id, employee_id")
    .eq("order_id", id)
    .eq("leg", leg)
    .is("completed_at", null)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  if (current) {
    await supabase
      .from("order_assignments")
      .update({ completed_at: nowIso })
      .eq("id", current.id);
  }

  const { data: created, error: insertError } = await supabase
    .from("order_assignments")
    .insert({
      order_id: id,
      leg,
      employee_id: employeeId,
      assigned_by: user.id,
    })
    .select("id, leg, employee_id, assigned_by, assigned_at, completed_at")
    .single();
  if (insertError || !created) {
    return NextResponse.json(
      {
        error:
          insertError?.code === "23505"
            ? "That leg already has an active assignment — refresh and try again."
            : "Could not save the assignment. Please try again.",
        code: insertError?.code === "23505" ? "ASSIGNMENT_CONFLICT" : undefined,
      },
      { status: insertError?.code === "23505" ? 409 : 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: current ? "order.reassign" : "order.assign",
    entity: "order_assignments",
    entityId: created.id as string,
    details: {
      orderId: id,
      leg,
      employeeId,
      employeeName: employee.fullName,
      replacedAssignmentId: current?.id ?? null,
      replacedEmployeeId: current?.employee_id ?? null,
    },
  });

  return NextResponse.json(
    {
      mode: "live",
      assignment: assignmentJson(
        created as Record<string, unknown>,
        employee.fullName,
      ),
    },
    { status: 201 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  const roleErr = roleGateError(gate, "ops_manager");
  if (roleErr) return roleErr;
  const ok = gate as GateOk;
  const { supabase, user } = ok;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = assignmentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const { data: assignment } = await supabase
    .from("order_assignments")
    .select("id, order_id, leg, employee_id, assigned_at, completed_at")
    .eq("id", input.assignmentId)
    .maybeSingle();
  if (!assignment || assignment.order_id !== id) {
    return NextResponse.json(
      { error: "Assignment not found for this order." },
      { status: 404 },
    );
  }
  if (assignment.completed_at) {
    return NextResponse.json(
      { error: "That assignment is already complete.", code: "ALREADY_COMPLETED" },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  // Admin override: close the assignment without a handover.
  if (input.action === "complete") {
    const { error: updateError } = await supabase
      .from("order_assignments")
      .update({ completed_at: nowIso })
      .eq("id", assignment.id);
    if (updateError) {
      return NextResponse.json(
        { error: "Could not complete the assignment. Please try again." },
        { status: 500 },
      );
    }
    await logAudit(supabase, {
      actorUserId: user.id,
      actorLabel: user.email ?? null,
      action: "order.assignment_complete",
      entity: "order_assignments",
      entityId: assignment.id as string,
      details: { orderId: id, leg: assignment.leg, via: "admin_override" },
    });
    return NextResponse.json({
      mode: "live",
      assignment: assignmentJson(
        { ...assignment, completed_at: nowIso } as Record<string, unknown>,
        null,
      ),
    });
  }

  // Reassign: validate the new rider, complete this row, insert fresh.
  const employees = await loadEmployeesWithRoles(ok);
  const employee = employees.find((e) => e.id === input.employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  const verdict = canAssignEmployee({
    leg: assignment.leg as string,
    employmentStatus: employee.employmentStatus,
    roles: employee.roles,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.message, code: verdict.code },
      { status: verdict.code === "EMPLOYEE_INACTIVE" ? 409 : 422 },
    );
  }

  await supabase
    .from("order_assignments")
    .update({ completed_at: nowIso })
    .eq("id", assignment.id);

  const { data: created, error: insertError } = await supabase
    .from("order_assignments")
    .insert({
      order_id: id,
      leg: assignment.leg,
      employee_id: employee.id,
      assigned_by: user.id,
    })
    .select("id, leg, employee_id, assigned_by, assigned_at, completed_at")
    .single();
  if (insertError || !created) {
    return NextResponse.json(
      { error: "Could not save the reassignment. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "order.reassign",
    entity: "order_assignments",
    entityId: created.id as string,
    details: {
      orderId: id,
      leg: assignment.leg,
      employeeId: employee.id,
      employeeName: employee.fullName,
      replacedAssignmentId: assignment.id,
      replacedEmployeeId: assignment.employee_id,
    },
  });

  return NextResponse.json({
    mode: "live",
    assignment: assignmentJson(
      created as Record<string, unknown>,
      employee.fullName,
    ),
  });
}
