import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import {
  HANDOVER_CHAIN,
  completedPointIds,
  nextHandoverPoint,
  orderItemCount,
  receivingRoles,
} from "@/lib/handovers";

/**
 * GET /api/admin/stages?employeeId= — employee stage queues (Phase 8).
 *
 * For the selected employee, returns the handover points they can
 * RECEIVE at (their roles against the chain in src/lib/handovers.ts)
 * and the orders awaiting each point, oldest first. "Awaiting point N"
 * is derived server-side from the order's status + its recorded
 * handovers (`nextHandoverPoint`) — there is no current-point column
 * to drift out of sync.
 *
 * Without `employeeId`, only the employee picker list is returned.
 * Orders in terminal or payment side-states never appear: they are
 * not in the handover flow.
 */

const ACTIVE_STATUSES = [
  "PLACED",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "RECEIVED",
  "IN_PROCESS",
  "READY",
  "OUT_FOR_DELIVERY",
];

interface QueueOrder {
  id: string;
  status: string;
  itemCount: number;
  customerName: string | null;
  createdAt: string;
  pickupSlot: string;
}

export async function GET(request: Request) {
  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json({ mode: "demo", employees: [], employee: null, queues: [] }, { status: 503 });
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { supabase } = gate;
  const employeeId = new URL(request.url).searchParams.get("employeeId");

  // Employee picker list (with roles) — same compose pattern as the
  // employees route.
  const { data: empRows, error: empError } = await supabase
    .from("employees")
    .select("id, employee_code, full_name, employment_status")
    .order("full_name", { ascending: true });
  if (empError) {
    return NextResponse.json({ error: "Could not load employees." }, { status: 500 });
  }
  const { data: roleRows } = await supabase
    .from("employee_roles")
    .select("employee_id, role");
  const rolesByEmployee = new Map<string, string[]>();
  for (const r of roleRows ?? []) {
    const list = rolesByEmployee.get(r.employee_id) ?? [];
    list.push(r.role as string);
    rolesByEmployee.set(r.employee_id, list);
  }
  const employees = (empRows ?? []).map((e) => ({
    id: e.id,
    employeeCode: e.employee_code,
    fullName: e.full_name,
    employmentStatus: e.employment_status,
    roles: rolesByEmployee.get(e.id) ?? [],
  }));

  const employee = employeeId
    ? (employees.find((e) => e.id === employeeId) ?? null)
    : null;
  if (employeeId && !employee) {
    return NextResponse.json(
      { error: "Employee not found.", code: "EMPLOYEE_NOT_FOUND" },
      { status: 404 },
    );
  }
  if (!employee) {
    return NextResponse.json({ mode: "live", employees, employee: null, queues: [] });
  }

  // Points this employee can receive at.
  const receivable = HANDOVER_CHAIN.filter((p) =>
    receivingRoles(p).some((r) => employee.roles.includes(r)),
  );

  // Active orders + their handover progress.
  const { data: orderRows, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, status, created_at, pickup_slot, profiles ( name ), order_items ( qty )",
    )
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: true });
  if (orderError) {
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }
  const orders = orderRows ?? [];
  const orderIds = orders.map((o) => o.id);
  const { data: handoverRows } = orderIds.length
    ? await supabase
        .from("handovers")
        .select("order_id, point_id")
        .in("order_id", orderIds)
    : { data: [] as { order_id: string; point_id: string }[] };
  const pointsByOrder = new Map<string, { pointId: string }[]>();
  for (const h of handoverRows ?? []) {
    const list = pointsByOrder.get(h.order_id) ?? [];
    list.push({ pointId: h.point_id });
    pointsByOrder.set(h.order_id, list);
  }
  const completedByOrder = new Map<string, Set<string>>();
  for (const [orderId, list] of pointsByOrder) {
    completedByOrder.set(orderId, completedPointIds(list));
  }

  const queues = receivable.map((point) => {
    const awaiting: QueueOrder[] = [];
    for (const o of orders) {
      const next = nextHandoverPoint(
        o.status,
        completedByOrder.get(o.id) ?? new Set<string>(),
      );
      if (next?.id !== point.id) continue;
      const profile = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;
      awaiting.push({
        id: o.id,
        status: o.status,
        itemCount: orderItemCount(
          (o.order_items ?? []).map((i) => ({ qty: Number(i.qty) })),
        ),
        customerName: profile?.name ?? null,
        createdAt: o.created_at,
        pickupSlot: o.pickup_slot,
      });
    }
    return {
      pointId: point.id,
      label: point.label,
      stage: point.stage,
      method: point.method,
      toRole: point.toRole,
      count: awaiting.length,
      orders: awaiting,
    };
  });

  return NextResponse.json({ mode: "live", employees, employee, queues });
}
