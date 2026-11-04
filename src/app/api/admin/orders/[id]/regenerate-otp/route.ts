import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { regenerateOtpSchema } from "@/lib/validation";
import { generateOtp } from "@/lib/handovers";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/admin/orders/[id]/regenerate-otp — issue a fresh pickup or
 * delivery OTP for an order (Phase 8).
 *
 * This is the recovery path for the OTP lockout (5 shared failed
 * attempts → 423 OTP_LOCKED) and for orders that predate schema v4
 * (no OTP on file → OTP_NOT_SET). Regenerating replaces the code,
 * clears its used marker, and resets the shared attempts counter to 0.
 * The new code is returned ONCE here so the admin can tell the
 * customer; the customer can also see it on their own order page.
 * Audit-logged as `handover.otp_regenerate`.
 */
export async function POST(
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
  const parsed = regenerateOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const { which } = parsed.data;
  const { supabase, user } = gate;

  const { data: order, error: loadError } = await supabase
    .from("orders")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const otp = generateOtp();
  const update =
    which === "pickup"
      ? { pickup_otp: otp, pickup_otp_used_at: null, otp_attempts: 0 }
      : { delivery_otp: otp, delivery_otp_used_at: null, otp_attempts: 0 };

  const { error } = await supabase
    .from("orders")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Could not regenerate the OTP. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "handover.otp_regenerate",
    entity: "orders",
    entityId: id,
    details: { which },
  });

  return NextResponse.json({ mode: "live", orderId: id, which, otp });
}
