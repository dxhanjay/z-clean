import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { employeeCreateSchema } from "@/lib/validation";
import { suggestNextEmployeeCode, type Employee, type StaffRole } from "@/lib/org";

/**
 * GET / POST /api/admin/employees — the single Employee Management
 * surface (Phase 7a, Requirements v2 §3).
 *
 * Employees are operational records with one or more rows in
 * employee_roles (the 12-role permission matrix in src/lib/org.ts).
 * A login is optional (user_id -> profiles) and never grants staff
 * access by itself.
 *
 * Live mode only, for a signed-in admin (getAdminGate; employees RLS
 * is admin-only too). Without Supabase: GET answers 503 { mode: "demo" }
 * with an empty list and the UI works on the browser demo store;
 * writes answer 503 { mode: "demo" }. Every live mutation is
 * audit-logged.
 */

type Gate = Awaited<ReturnType<typeof getAdminGate>>;

interface EmployeeRow {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  user_id: string | null;
  branch_id: string | null;
  manager_id: string | null;
  employment_status: string;
  joining_date: string | null;
  created_at: string;
}

async function composeEmployees(
  supabase: Extract<Gate, { kind: "ok" }>["supabase"],
  rows: EmployeeRow[],
): Promise<Employee[]> {
  const { data: roleRows } = await supabase
    .from("employee_roles")
    .select("employee_id, role");
  const rolesByEmployee = new Map<string, StaffRole[]>();
  for (const r of roleRows ?? []) {
    const list = rolesByEmployee.get(r.employee_id) ?? [];
    list.push(r.role as StaffRole);
    rolesByEmployee.set(r.employee_id, list);
  }
  const { data: branchRows } = await supabase.from("branches").select("id, name");
  const branchName = new Map((branchRows ?? []).map((b) => [b.id, b.name]));
  const { data: allNames } = await supabase.from("employees").select("id, full_name");
  const nameById = new Map((allNames ?? []).map((e) => [e.id, e.full_name]));

  return rows.map((e) => ({
    id: e.id,
    employeeCode: e.employee_code,
    fullName: e.full_name,
    phone: e.phone,
    email: e.email,
    userId: e.user_id,
    branchId: e.branch_id,
    branchName: e.branch_id ? (branchName.get(e.branch_id) ?? null) : null,
    managerId: e.manager_id,
    managerName: e.manager_id ? (nameById.get(e.manager_id) ?? null) : null,
    employmentStatus: e.employment_status === "inactive" ? "inactive" : "active",
    joiningDate: e.joining_date,
    roles: rolesByEmployee.get(e.id) ?? [],
    createdAt: e.created_at,
  }));
}

export async function GET() {
  const gate = await getAdminGate();
  if (gate.kind === "demo") {
    return NextResponse.json({ mode: "demo", employees: [] }, { status: 503 });
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { supabase } = gate;
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id, employee_code, full_name, phone, email, user_id, branch_id, manager_id, employment_status, joining_date, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Could not load employees." }, { status: 500 });
  }

  const employees = await composeEmployees(supabase, (data ?? []) as EmployeeRow[]);
  return NextResponse.json({ mode: "live", employees });
}

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = employeeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const { supabase, user } = gate;

  // Employee code: use the admin's value, or suggest the next free
  // ZC-EMP-nnnn from the codes already in use.
  let employeeCode = input.employeeCode?.trim() ? input.employeeCode.trim() : "";
  if (!employeeCode) {
    const { data: codes } = await supabase.from("employees").select("employee_code");
    employeeCode = suggestNextEmployeeCode((codes ?? []).map((c) => c.employee_code));
  }

  const { data: employee, error: insertError } = await supabase
    .from("employees")
    .insert({
      employee_code: employeeCode,
      full_name: input.fullName,
      phone: input.phone,
      email: input.email?.trim() ? input.email.trim() : null,
      user_id: input.userId ?? null,
      branch_id: input.branchId ?? null,
      manager_id: input.managerId ?? null,
      employment_status: input.employmentStatus ?? "active",
      joining_date: input.joiningDate?.trim() ? input.joiningDate.trim() : null,
    })
    .select(
      "id, employee_code, full_name, phone, email, user_id, branch_id, manager_id, employment_status, joining_date, created_at",
    )
    .single();
  if (insertError || !employee) {
    if (insertError?.code === "23505") {
      return NextResponse.json(
        {
          error: `Employee code ${employeeCode} is already in use. Pick another code.`,
          code: "DUPLICATE_CODE",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Could not create the employee. Please try again." },
      { status: 500 },
    );
  }

  const roleRows = [...new Set(input.roles)].map((role) => ({
    employee_id: employee.id,
    role,
  }));
  const { error: rolesError } = await supabase.from("employee_roles").insert(roleRows);
  if (rolesError) {
    // Best-effort cleanup so a half-created employee never lingers
    // without roles (which would lock them out of every stage queue).
    await supabase.from("employees").delete().eq("id", employee.id);
    return NextResponse.json(
      { error: "Could not assign the employee's roles. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "employee.create",
    entity: "employees",
    entityId: employee.id,
    details: {
      employeeCode: employee.employee_code,
      fullName: employee.full_name,
      roles: roleRows.map((r) => r.role),
      branchId: employee.branch_id,
      managerId: employee.manager_id,
      employmentStatus: employee.employment_status,
    },
  });

  const [composed] = await composeEmployees(supabase, [employee as EmployeeRow]);
  return NextResponse.json({ mode: "live", employee: composed }, { status: 201 });
}
