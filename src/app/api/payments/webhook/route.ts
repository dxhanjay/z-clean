import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/payments/webhook — Razorpay webhook (Phase 3).
 *
 * This is the ONLY path that marks a payment as paid. The browser's
 * checkout callback is cosmetic; money state changes only here, after
 * the signature check (HMAC-SHA256 hex of the RAW request body, keyed
 * with RAZORPAY_WEBHOOK_SECRET).
 *
 * Configure in the Razorpay dashboard:
 *   URL:    https://<your-domain>/api/payments/webhook
 *   Secret: the same value as RAZORPAY_WEBHOOK_SECRET
 *   Events: payment.captured, payment.failed
 *
 * Updates run through the service-role client because a webhook has no
 * user session (RLS would otherwise block the write). Handlers are
 * idempotent: an already-paid payment short-circuits to 200.
 */

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  status: string;
}

interface RazorpayWebhookBody {
  event: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
  };
}

function signatureValid(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!signatureValid(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const entity = body.payload?.payment?.entity;
  if (!entity?.order_id) {
    // Valid signature, nothing we act on (e.g. other event types).
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Database not configured for webhook processing." },
      { status: 503 },
    );
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id, order_id, status")
    .eq("gateway_order_id", entity.order_id)
    .maybeSingle();
  if (!payment) {
    // Unknown gateway order — acknowledge so Razorpay stops retrying.
    return NextResponse.json({ received: true });
  }

  if (body.event === "payment.captured") {
    if (payment.status === "paid") {
      return NextResponse.json({ received: true, idempotent: true });
    }
    await admin
      .from("payments")
      .update({ gateway_payment_id: entity.id, status: "paid" })
      .eq("id", payment.id);
    await admin
      .from("orders")
      .update({ payment_status: "paid", status: "PICKUP_SCHEDULED" })
      .eq("id", payment.order_id)
      .eq("payment_status", "pending");
    await admin.from("order_status_history").insert({
      order_id: payment.order_id,
      status: "PICKUP_SCHEDULED",
      note: "Online payment confirmed (Razorpay webhook). Pickup scheduled.",
    });
    return NextResponse.json({ received: true });
  }

  if (body.event === "payment.failed") {
    if (payment.status === "failed") {
      return NextResponse.json({ received: true, idempotent: true });
    }
    await admin
      .from("payments")
      .update({ gateway_payment_id: entity.id, status: "failed" })
      .eq("id", payment.id);
    await admin
      .from("orders")
      .update({ payment_status: "failed", status: "PAYMENT_FAILED" })
      .eq("id", payment.order_id)
      .eq("payment_status", "pending");
    await admin.from("order_status_history").insert({
      order_id: payment.order_id,
      status: "PAYMENT_FAILED",
      note: "Online payment failed (Razorpay webhook).",
    });
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
