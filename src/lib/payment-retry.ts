/**
 * Payment-retry eligibility (Phase 5a) — ONE rule set used by the retry
 * API route (server, authoritative), the order detail page (to decide
 * whether to offer the action) and scripts/test-retry.mjs.
 *
 * An online payment may be retried only while the order is still waiting
 * for that payment:
 *   · payment_method is Razorpay (Pay on Delivery has nothing to retry —
 *     the customer pays at delivery, and the admin marks COD collected);
 *   · payment_status is "pending" (checkout never finished / dismissed)
 *     or "failed" (the gateway reported a failure via the webhook);
 *   · the order status is the matching payment side-state used since
 *     Phase 3: PAYMENT_PENDING or PAYMENT_FAILED.
 *
 * Everything else — already paid, COD, refunded, or an order that has
 * already moved into the fulfilment flow — is rejected with a stable
 * machine-readable code so the UI can show the right message.
 */

export interface RetryOrderSnapshot {
  paymentMethod: string;
  paymentStatus: string;
  status: string;
}

export type RetryEligibility =
  | { ok: true }
  | { ok: false; code: string; error: string };

export function paymentRetryEligibility(
  order: RetryOrderSnapshot,
): RetryEligibility {
  if (order.paymentMethod === "cod") {
    return {
      ok: false,
      code: "NOT_RETRYABLE_COD",
      error:
        "This is a Pay on Delivery order — there is no online payment to retry. Payment is collected when your laundry is delivered back.",
    };
  }
  if (order.paymentMethod !== "razorpay") {
    return {
      ok: false,
      code: "NOT_RETRYABLE_METHOD",
      error: "This order does not use online payment, so it cannot be retried here.",
    };
  }
  if (order.paymentStatus === "paid") {
    return {
      ok: false,
      code: "ALREADY_PAID",
      error: "This order is already paid — no further payment is needed.",
    };
  }
  if (
    order.paymentStatus !== "pending" &&
    order.paymentStatus !== "failed"
  ) {
    return {
      ok: false,
      code: "NOT_RETRYABLE_STATE",
      error: `A payment in state "${order.paymentStatus}" cannot be retried.`,
    };
  }
  if (order.status !== "PAYMENT_PENDING" && order.status !== "PAYMENT_FAILED") {
    return {
      ok: false,
      code: "NOT_RETRYABLE_STATE",
      error:
        "This order is no longer waiting for payment, so its payment cannot be retried.",
    };
  }
  return { ok: true };
}

/** Convenience boolean for UI code. */
export function isPaymentRetryEligible(order: RetryOrderSnapshot): boolean {
  return paymentRetryEligibility(order).ok;
}
