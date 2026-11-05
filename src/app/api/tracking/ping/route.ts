import { NextResponse } from "next/server";
import { getStaffGate } from "@/lib/tracking-server";
import { trackingPingSchema } from "@/lib/validation";
import { canPingAssignment, isValidAccuracy } from "@/lib/tracking";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/tracking/ping — one GPS fix from a rider's staff app.
 *
 * The authorization is ASSIGNMENT-BASED, never role-based (the pure
 * predicate is src/lib/tracking.ts `canPingAssignment`):
 *
 *   - the caller must resolve to an employee record (employees.user_id),
 *   - the assignment must belong to THAT employee,
 *   - and it must still be active (the leg's handover closes it).
 *
 * An admin tier confers no ping rights: if the assignment is not
 * yours, you cannot move its marker. The insert runs through the
 * service role ONLY after those checks pass (rider_locations has no
 * client insert policy at all). Rate-limited to 12/minute/user with
 * the P0 limiter — comfortably above the app's 15-second throttle,
 * far below anything abusive.
 */
export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = trackingPingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;
  if (!isValidAccuracy(input.accuracyM)) {
    return NextResponse.json(
      { error: "That accuracy value is not usable.", code: "INVALID_ACCURACY" },
      { status: 422 },
    );
  }

  const allowed = await checkRateLimit(`ping:${gate.user.id}`, 12, 60);
  if (!allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const { admin } = gate;
  const employeeIdForUser =
    gate.kind === "staff" ? gate.employee.id : (gate.employee?.id ?? null);

  const { data: row } = await admin
    .from("order_assignments")
    .select("id, order_id, leg, employee_id, completed_at")
    .eq("id", input.assignmentId)
    .maybeSingle();

  const verdict = canPingAssignment({
    assignment: row
      ? {
          id: row.id as string,
          orderId: row.order_id as string,
          leg: row.leg as string,
          employeeId: row.employee_id as string,
          completedAt: (row.completed_at as string | null) ?? null,
        }
      : null,
    employeeIdForUser,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.message, code: verdict.code },
      { status: verdict.code === "ASSIGNMENT_NOT_FOUND" ? 404 : 403 },
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("rider_locations")
    .insert({
      order_id: row!.order_id,
      assignment_id: row!.id,
      employee_id: row!.employee_id,
      lat: input.lat,
      lng: input.lng,
      accuracy_m: input.accuracyM ?? null,
    })
    .select("id, recorded_at")
    .single();
  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "Could not record that location. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    pingId: inserted.id,
    recordedAt: inserted.recorded_at,
  });
}
