import { NextResponse } from "next/server";
import { getStaffGate } from "@/lib/tracking-server";
import { loadOrderFinance } from "@/lib/finance-server";
import {
  completedPointIds,
  nextHandoverPoint,
  orderItemCount,
} from "@/lib/handovers";
import { legHandoverPointId, type TrackingLeg } from "@/lib/tracking";

/**
 * GET /api/staff/tasks — the signed-in rider's active assignments
 * (Staff Web App phase).
 *
 * A staff caller sees ONLY their own active assignments — the query
 * is scoped to the employee record linked to their account, resolved
 * server-side by getStaffGate() (employees sit behind admin-only
 * RLS, so reads run through the service role AFTER that scoping is
 * established). Admin tiers get the support view: every active
 * assignment, labelled with its rider.
 *
 * Each task carries exactly what the rider operationally needs: the
 * order ref + status, the leg, the slot, the customer's address and
 * phone (they are going to that door), the item count, whether the
 * chain is actually waiting on THIS leg's handover (an assignment can
 * exist before the plant stages finish), and — delivery legs only —
 * the COD amount still to collect, from the finance summary. No other
 * money is exposed.
 */
export async function GET() {
  const gate = await getStaffGate();
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
    return NextResponse.json(
      { error: "Staff access required.", code: "STAFF_ONLY" },
      { status: 403 },
    );
  }

  const { admin } = gate;
  const supportView = gate.kind === "admin";

  let query = admin
    .from("order_assignments")
    .select("id, order_id, leg, employee_id, assigned_at")
    .is("completed_at", null)
    .order("assigned_at", { ascending: true });
  if (!supportView) {
    query = query.eq("employee_id", gate.employee.id);
  }
  const { data: assignmentRows, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Could not load your tasks. Please try again." },
      { status: 500 },
    );
  }

  const tasks = [];
  for (const a of assignmentRows ?? []) {
    const orderId = a.order_id as string;
    const leg = a.leg as TrackingLeg;

    const { data: order } = await admin
      .from("orders")
      .select(
        "id, user_id, address_id, status, payment_status, payment_method, delivery_type, pickup_slot, delivery_slot, total_paise, created_at",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) continue;

    const [{ data: address }, { data: customer }, { data: items }, { data: handoverRows }, { data: rider }] =
      await Promise.all([
        order.address_id
          ? admin
              .from("addresses")
              .select("line, area, city, pincode, lat, lng, latitude, longitude")
              .eq("id", order.address_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        admin
          .from("profiles")
          .select("name, phone")
          .eq("id", order.user_id)
          .maybeSingle(),
        admin.from("order_items").select("qty").eq("order_id", orderId),
        admin.from("handovers").select("point_id").eq("order_id", orderId),
        admin
          .from("employees")
          .select("full_name")
          .eq("id", a.employee_id)
          .maybeSingle(),
      ]);

    const next = nextHandoverPoint(
      order.status as string,
      completedPointIds(
        (handoverRows ?? []).map((h) => ({ pointId: h.point_id as string })),
      ),
    );
    const awaitingThisLeg = next?.id === legHandoverPointId(leg);

    let codDuePaise: number | null = null;
    if (leg === "delivery") {
      if (order.payment_method === "cod") {
        const loaded = await loadOrderFinance(admin, orderId);
        codDuePaise = loaded ? loaded.finance.outstandingPaise : null;
      } else {
        codDuePaise = 0;
      }
    }

    const { data: lastPing } = await admin
      .from("rider_locations")
      .select("recorded_at")
      .eq("assignment_id", a.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    tasks.push({
      assignmentId: a.id,
      leg,
      assignedAt: a.assigned_at,
      employeeId: a.employee_id,
      employeeName: rider?.full_name ?? null,
      order: {
        id: orderId,
        ref: orderId.slice(0, 8).toUpperCase(),
        status: order.status,
        paymentStatus: order.payment_status,
        paymentMethod: order.payment_method,
        deliveryType: order.delivery_type,
        pickupSlot: order.pickup_slot,
        deliverySlot: order.delivery_slot,
        createdAt: order.created_at,
        itemCount: orderItemCount(
          (items ?? []).map((r) => ({ qty: Number(r.qty) })),
        ),
      },
      customer: {
        name: customer?.name ?? null,
        phone: customer?.phone ?? null,
      },
      address: address
        ? {
            line: address.line,
            area: address.area,
            city: address.city,
            pincode: address.pincode,
            lat: address.lat ?? address.latitude ?? null,
            lng: address.lng ?? address.longitude ?? null,
          }
        : null,
      codDuePaise,
      awaitingThisLeg,
      blockedByLabel: awaitingThisLeg ? null : (next?.label ?? null),
      lastPingAt: lastPing?.recorded_at ?? null,
    });
  }

  return NextResponse.json({
    mode: "live",
    supportView,
    viewer: {
      name: gate.kind === "staff" ? gate.employee.fullName : null,
      role: gate.role,
    },
    tasks,
  });
}
