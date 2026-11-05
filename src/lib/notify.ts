/**
 * Notification hook (Phase 4) — SERVER ONLY.
 *
 * Every order status change made through the admin API calls
 * `notifyStatusChange` exactly once. Two providers run today:
 *   - log:  writes a structured line to the server log (unchanged
 *           since Phase 4; still the audit-friendly record).
 *   - push: (Delta 2) sends an Expo push to the order's customer via
 *           src/lib/push.ts, addressed by looking the order's owner
 *           up with the service-role client. Delivery to standalone
 *           builds is owner-gated on FCM V1 / APNs credentials held
 *           by EAS — see the README's Delta 2 section. No WhatsApp,
 *           SMS or email leaves the system yet, and nothing in the
 *           UI claims otherwise.
 *
 * TODO(launch): plug in further providers behind this same flow, e.g.
 *   - WhatsApp: MSG91 / Twilio WhatsApp API to the customer's phone
 *   - Email:    Resend / SES to the customer's email
 * Call sites (the admin status / handover routes) must not change
 * when providers are added.
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
  // The log provider always runs; push (below) runs alongside it.
  return logProvider;
}

/**
 * Push provider (Delta 2): resolve the order's owner and send the
 * status push to their registered devices. Quietly skips when there
 * is no service-role client (demo mode), the order can't be loaded,
 * or the customer has no tokens — and sendPushToUser itself never
 * throws. Kept separate from the log provider so the Phase 4 log
 * line's behaviour is byte-for-byte unchanged.
 */
async function pushStatusChange(
  notification: StatusChangeNotification,
): Promise<void> {
  const { createAdminClient } = await import("./supabase/admin");
  const admin = createAdminClient();
  if (!admin) return;

  const { data: order, error } = await admin
    .from("orders")
    .select("user_id")
    .eq("id", notification.orderId)
    .maybeSingle();
  if (error || !order) {
    if (error) {
      console.error("[notify] push skipped — order owner lookup failed:", error.message);
    }
    return;
  }

  const { sendPushToUser, statusChangePush } = await import("./push");
  const summary = await sendPushToUser(
    admin,
    (order as { user_id: string }).user_id,
    statusChangePush(notification.orderId, notification.status, {
      codCollected: notification.codCollected,
    }),
  );
  if (summary.sent > 0 || summary.pruned > 0 || summary.errors > 0) {
    console.info(
      `[notify:push] order=${notification.orderId} sent=${summary.sent} pruned=${summary.pruned} errors=${summary.errors}`,
    );
  }
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
  try {
    await pushStatusChange(notification);
  } catch (err) {
    console.error("[notify] push failed (status change kept):", err);
  }
}
