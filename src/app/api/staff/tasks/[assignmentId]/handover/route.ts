import { NextResponse } from "next/server";
import { getStaffGate } from "@/lib/tracking-server";
import { staffHandoverSchema } from "@/lib/validation";
import { completeHandover } from "@/lib/handovers-server";
import { legHandoverPointId, type TrackingLeg } from "@/lib/tracking";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/staff/tasks/[assignmentId]/handover — the rider completes
 * their leg's doorstep handover from the staff web app.
 *
 * The rider never chooses the point or the receiving employee: the
 * assignment fixes both (pickup leg → the chain's "pickup" OTP point,
 * delivery leg → "delivery"; receiver = the assignment's employee,
 * i.e. the caller themselves). What the rider supplies is the
 * customer's OTP — plus the physical count, a missing-item report,
 * and, on delivery legs, whether the COD balance was collected.
 *
 * Everything else — sequence, role eligibility, OTP verification and
 * lockout, status effects, COD semantics, history, notifications —
 * is the SHARED flow in src/lib/handovers-server.ts, run here
 * through the service role because a staff session has no admin RLS
 * rights. The route's own checks come first: the assignment must
 * exist, be active, and belong to the caller's linked employee
 * (admins use the admin console route instead — support view is
 * read-only here by design).
 *
 * On success the assignment is completed, which closes the rider's
 * location-ping gate for the leg.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await params;

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
  if (gate.kind === "admin") {
    return NextResponse.json(
      {
        error:
          "Admins complete handovers from the admin console — the staff app is rider-scoped.",
        code: "USE_ADMIN_CONSOLE",
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = staffHandoverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const { admin, employee, user } = gate;

  const { data: assignment } = await admin
    .from("order_assignments")
    .select("id, order_id, leg, employee_id, completed_at")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json(
      { error: "Assignment not found.", code: "ASSIGNMENT_NOT_FOUND" },
      { status: 404 },
    );
  }
  if (assignment.employee_id !== employee.id) {
    return NextResponse.json(
      { error: "This assignment belongs to another rider.", code: "NOT_YOUR_ASSIGNMENT" },
      { status: 403 },
    );
  }
  if (assignment.completed_at) {
    return NextResponse.json(
      { error: "This assignment is already complete.", code: "ASSIGNMENT_COMPLETED" },
      { status: 409 },
    );
  }

  const leg = assignment.leg as TrackingLeg;
  const result = await completeHandover(
    admin,
    { userId: user.id, label: user.email ?? null },
    {
      orderId: assignment.order_id as string,
      pointId: legHandoverPointId(leg),
      toEmployeeId: employee.id,
      method: "otp",
      otp: input.otp,
      quantity: input.quantity,
      missingItem: Boolean(input.missingItem),
      note: input.note ?? null,
      codCollected: Boolean(input.codCollected),
    },
  );

  if (!result.ok) {
    const errorBody: Record<string, unknown> = { error: result.error };
    if (result.code) errorBody.code = result.code;
    return NextResponse.json(errorBody, { status: result.httpStatus });
  }

  // The handover closes the assignment — and with it the ping gate.
  const nowIso = new Date().toISOString();
  const { error: closeError } = await admin
    .from("order_assignments")
    .update({ completed_at: nowIso })
    .eq("id", assignmentId)
    .is("completed_at", null);
  if (closeError) {
    // The handover itself is recorded and correct; a failed close
    // leaves a stale active row an admin can close from the console.
    console.error(
      `[staff-handover] could not close assignment ${assignmentId}: ${closeError.message}`,
    );
  }

  await logAudit(admin, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "staff.handover_complete",
    entity: "order_assignments",
    entityId: assignmentId,
    details: {
      orderId: assignment.order_id,
      leg,
      handoverId: result.handover.id,
      status: result.status,
    },
  });

  return NextResponse.json({
    mode: "live",
    assignmentId,
    orderId: result.orderId,
    handover: result.handover,
    status: result.status,
    paymentStatus: result.paymentStatus,
    assignmentCompleted: !closeError,
  });
}
