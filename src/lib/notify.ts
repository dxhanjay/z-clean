/**
 * Notification hook (Phase 4) — SERVER ONLY.
 *
 * Every order status change made through the admin API calls
 * `notifyStatusChange` exactly once. Today the only provider is a log
 * provider: it writes a structured line to the server log and sends
 * NOTHING — no WhatsApp, SMS or email leaves the system yet, and nothing
 * in the UI claims otherwise.
 *
 * TODO(launch): plug in real providers behind this same interface, e.g.
 *   - WhatsApp: MSG91 / Twilio WhatsApp API to the customer's phone
 *   - Email:    Resend / SES to the customer's email
 * Select with the NOTIFY_PROVIDER env var ("log" default). Call sites
 * (the admin status route) must not change when providers are added.
 */

export interface StatusChangeNotification {
  orderId: string;
  /** The order's status AFTER the change. */
  status: string;
  /** Admin note attached to the transition, if any. */
  note?: string | null;
  /** Payment status after the change (e.g. "paid" after COD collection). */
  paymentStatus?: string;
  /** True when this change recorded a Pay-on-Delivery collection. */
  codCollected?: boolean;
}

interface NotifyProvider {
  name: string;
  send(notification: StatusChangeNotification): Promise<void>;
}

const logProvider: NotifyProvider = {
  name: "log",
  async send(notification) {
    console.info(
      `[notify:${this.name}] order=${notification.orderId} status=${notification.status}` +
        (notification.paymentStatus ? ` payment=${notification.paymentStatus}` : "") +
        (notification.codCollected ? " codCollected=true" : "") +
        (notification.note ? ` note=${JSON.stringify(notification.note)}` : ""),
    );
  },
};

function activeProvider(): NotifyProvider {
  // Only "log" exists today; real providers slot in here by env switch.
  return logProvider;
}

/**
 * Fire-and-record a status-change notification. Never throws: a
 * notification problem must not fail the status update itself.
 */
export async function notifyStatusChange(
  notification: StatusChangeNotification,
): Promise<void> {
  try {
    await activeProvider().send(notification);
  } catch (err) {
    console.error("[notify] provider failed (status change kept):", err);
  }
}
