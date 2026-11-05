import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { handoverCompleteSchema } from "@/lib/validation";
import { completeHandover } from "@/lib/handovers-server";

/**
 * POST /api/admin/orders/[id]/handover — complete one QR/OTP handover
 * (Phase 8, Requirements v2 §2/§3).
 *
 * Staff acting from the console SELECT the employee who is physically
 * receiving the items (`toEmployeeId`); every rule — sequence,
 * employee eligibility, OTP/QR verification, quantity flags, status
 * effects, COD semantics — is enforced by the shared server flow in
 * src/lib/handovers-server.ts (`completeHandover`), which the staff
 * web app's handover route also calls, so the two surfaces can never
 * drift apart. The demo mode applier runs the same pure validator
 * (src/lib/handovers.ts `checkHandover`) underneath both.
 *
 * Failed OTP attempts do NOT create handover rows (the ledger holds
 * completed transfers only) — the shared flow persists the incremented
 * attempts counter and audit-logs the failure instead.
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
  const parsed = handoverCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const result = await completeHandover(
    gate.supabase,
    { userId: gate.user.id, label: gate.user.email ?? null },
    {
      orderId: id,
      pointId: input.pointId,
      toEmployeeId: input.toEmployeeId,
      method: input.method,
      otp: input.otp || null,
      qrToken: input.qrToken || null,
      quantity: input.quantity,
      missingItem: Boolean(input.missingItem),
      note: input.note ?? null,
      codCollected: Boolean(input.codCollected),
    },
  );

  if (!result.ok) {
    const errorBody: Record<string, unknown> = { error: result.error };
    if (result.code) errorBody.code = result.code;
    if (result.orderId) errorBody.orderId = result.orderId;
    if (result.handoverId) errorBody.handoverId = result.handoverId;
    return NextResponse.json(errorBody, { status: result.httpStatus });
  }

  return NextResponse.json({
    mode: "live",
    orderId: result.orderId,
    handover: result.handover,
    status: result.status,
    paymentStatus: result.paymentStatus,
    nextPoint: result.nextPoint,
  });
}
