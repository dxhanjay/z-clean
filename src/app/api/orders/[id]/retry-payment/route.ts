import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";
import { paymentRetryEligibility } from "@/lib/payment-retry";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/orders-server";
import { demoOrNotConfigured, notConfiguredResponse } from "@/lib/api-errors";

/**
 * POST /api/orders/[id]/retry-payment — retry an unpaid online payment
 * (Phase 5a). Closes the Phase 3/4 gap where a dismissed or failed
 * Razorpay checkout left the order parked at PAYMENT_PENDING /
 * PAYMENT_FAILED with "our team will contact you" as the only path.
 *
 * Rules (enforced in order):
 *   1. Owner-only. Live mode requires the signed-in owner (RLS also
 *      restricts the row to the owner, so another customer's order is
 *      simply not found → 404, same convention as GET /api/orders/[id]).
 *      Without Supabase: the established 503 { mode: "demo" } — in demo
 *      mode the order page re-uses its labelled simulation actions.
 *   2. Eligibility per src/lib/payment-retry.ts: Razorpay orders with
 *      payment_status pending/failed in status PAYMENT_PENDING /
 *      PAYMENT_FAILED only. COD → 422, already paid → 422.
 *   3. A NEW Razorpay gateway order is created for the SAME server-side
 *      total (orders.total_paise — client amounts are never accepted)
 *      and a new payments row is inserted as "created".
 *
 * Superseded attempts: the payments.status enum has no "superseded"
 * value, so when a retry starts, any earlier attempt still sitting at
 * "created" (checkout opened but never finished) is closed out as
 * "failed". Such rows keep gateway_payment_id = null, which is what
 * distinguishes a superseded/abandoned attempt from a gateway-reported
 * failure (those carry the Razorpay payment id). Attempts already
 * "failed" are left untouched.
 *
 * The order is reset to payment_status "pending" / status
 * PAYMENT_PENDING when the new attempt starts — required so the
 * verified webhook's guarded updates (.eq payment_status "pending")
 * accept the new attempt's captured/failed events. As everywhere else,
 * the webhook remains the ONLY path that marks an order paid: this
 * route never sets "paid".
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth resolves through resolveRequestAuth (P0 bearer parity): the
  // web cookie session OR a validated Bearer token from the mobile
  // app. The resolved client carries the caller's identity, so the
  // owner-scoped queries below behave identically either way.
  const auth = await resolveRequestAuth();
  if (auth.kind === "unconfigured") {
    return demoOrNotConfigured({
      mode: "demo",
      message: "Supabase not configured — demo mode.",
    });
  }
  if (auth.kind === "misconfigured") {
    return notConfiguredResponse();
  }
  if (auth.kind !== "user") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { supabase, user } = auth;

  const { data: order, error: loadError } = await supabase
    .from("orders")
    .select("id, user_id, status, payment_status, payment_method, total_paise")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !order || order.user_id !== user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const eligibility = paymentRetryEligibility({
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    status: order.status,
  });
  if (!eligibility.ok) {
    return NextResponse.json(
      { error: eligibility.error, code: eligibility.code },
      { status: 422 },
    );
  }

  // Gateway keys not set up yet: the order stays exactly as it is (still
  // retryable later) — mirror POST /api/orders' unconfigured response.
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      {
        mode: "live",
        orderId: order.id,
        status: order.status,
        paymentStatus: order.payment_status,
        payment: { gateway: "razorpay", gatewayConfigured: false },
      },
      { status: 200 },
    );
  }

  const gatewayOrder = await createRazorpayOrder({
    amountPaise: order.total_paise,
    receipt: order.id,
  });
  if (!gatewayOrder) {
    return NextResponse.json(
      {
        error:
          "Online payment could not be restarted right now. Your order is unchanged — please try again in a little while.",
        orderId: order.id,
      },
      { status: 502 },
    );
  }

  // Close out abandoned earlier attempts (see header note), then record
  // the new attempt.
  await supabase
    .from("payments")
    .update({ status: "failed" })
    .eq("order_id", order.id)
    .eq("status", "created");

  const { error: paymentError } = await supabase.from("payments").insert({
    order_id: order.id,
    gateway: "razorpay",
    gateway_order_id: gatewayOrder.id,
    amount_paise: order.total_paise,
    status: "created",
  });
  if (paymentError) {
    return NextResponse.json(
      {
        error:
          "A new payment was started with Razorpay but could not be recorded. Please contact us before paying so we can reconcile it.",
        orderId: order.id,
      },
      { status: 500 },
    );
  }

  // Reset the order to awaiting-payment so the webhook guards accept
  // this attempt's outcome (no-op values when retrying from "pending").
  const { error: orderError } = await supabase
    .from("orders")
    .update({
      payment_status: "pending",
      status: "PAYMENT_PENDING",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (orderError) {
    return NextResponse.json(
      {
        error:
          "A new payment was started but the order could not be updated. Please contact us before paying so we can reconcile it.",
        orderId: order.id,
      },
      { status: 500 },
    );
  }

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: "PAYMENT_PENDING",
    note: "Customer restarted online payment (new Razorpay attempt).",
    actor_id: user.id,
  });

  return NextResponse.json(
    {
      mode: "live",
      orderId: order.id,
      status: "PAYMENT_PENDING",
      paymentStatus: "pending",
      payment: {
        gateway: "razorpay",
        gatewayConfigured: true,
        gatewayOrderId: gatewayOrder.id,
        amountPaise: order.total_paise,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    },
    { status: 201 },
  );
}
