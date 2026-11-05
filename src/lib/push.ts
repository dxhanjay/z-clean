import type { SupabaseClient } from "@supabase/supabase-js";
import { ORDER_STEPS, statusLabel } from "./order-flow";

/**
 * Expo push notifications (Delta 2) — SERVER ONLY (except the pure
 * helpers, which are unit-tested in scripts/test-push.mjs).
 *
 * Pipeline: the mobile app registers its Expo push token via
 * POST /api/push/register (rows in `push_tokens`, supabase/
 * schema_v8.sql). When an order's status changes, src/lib/notify.ts
 * calls sendPushToUser() with the service-role client; messages go to
 * the Expo Push Service, which fans out to APNs / FCM.
 *
 * Delivery credentials are OWNER-GATED and live OUTSIDE this code:
 *   - Android standalone builds need an FCM V1 service-account key
 *     uploaded to EAS (free Firebase project);
 *   - iOS needs APNs credentials via the Apple Developer account.
 * Until those exist, Expo accepts the messages but devices in
 * standalone builds may not receive them — the pipeline here is
 * complete either way, and every failure is logged, never thrown:
 * a push problem must not fail the status update that triggered it
 * (same fire-and-forget standard as notify.ts).
 *
 * The pure helpers carry no imports beyond order-flow copy, so the
 * test script can compile this file standalone (the rate-limit.ts
 * pattern): isExpoPushToken / chunkArray / buildPushMessages /
 * tokensToPrune / statusChangePush.
 */

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo accepts at most 100 messages per push request. */
export const PUSH_CHUNK_SIZE = 100;

const EXPO_TOKEN_PATTERN =
  /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-+/=.]+\]$/;

/** True iff `token` looks like an Expo push token. */
export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && EXPO_TOKEN_PATTERN.test(token);
}

/** Split `items` into consecutive chunks of at most `size`. */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  const step = Math.max(1, Math.floor(size) || 1);
  for (let i = 0; i < items.length; i += step) {
    chunks.push(items.slice(i, i + step));
  }
  return chunks;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
  priority: "high";
}

/** One Expo message per token, in the shape the Push Service expects. */
export function buildPushMessages(
  tokens: readonly string[],
  payload: PushPayload,
): ExpoPushMessage[] {
  return tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: "default",
    priority: "high",
  }));
}

/** A per-message receipt from the Expo Push Service. */
export interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * The tokens whose ticket says the device is gone
 * (details.error === "DeviceNotRegistered") — the caller deletes
 * these rows so dead installs stop accumulating. Tickets align with
 * tokens by index (Expo returns one ticket per message, in order).
 */
export function tokensToPrune(
  tokens: readonly string[],
  tickets: readonly ExpoPushTicket[],
): string[] {
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    if (
      ticket?.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered" &&
      tokens[i]
    ) {
      dead.push(tokens[i]);
    }
  });
  return dead;
}

/**
 * Customer copy for an order-status push — reuses the tracking
 * timeline's labels and hints (order-flow.ts) so the app, the web
 * tracking page and the push all say the same thing. `data` carries
 * the deep link the app's notification listener routes on.
 */
export function statusChangePush(
  orderId: string,
  status: string,
  opts?: { codCollected?: boolean },
): PushPayload {
  const step = ORDER_STEPS.find((s) => s.status === status);
  let title: string;
  let body: string;
  if (step) {
    title = step.label;
    body = step.hint;
  } else if (status === "CANCELLED") {
    title = "Order cancelled";
    body =
      "Your order has been cancelled. If this wasn't expected, please contact us.";
  } else {
    title = "Order update";
    body = `Your order status is now ${statusLabel(status)}.`;
  }
  if (opts?.codCollected) {
    body += " Payment collected — thank you.";
  }
  return { title, body, data: { orderId, url: `/orders/${orderId}` } };
}

export interface PushSendSummary {
  /** Messages Expo accepted (ticket status "ok"). */
  sent: number;
  /** Dead tokens deleted after DeviceNotRegistered tickets. */
  pruned: number;
  /** Messages that failed for any other reason. */
  errors: number;
}

/**
 * Send one payload to every device a user has registered. Loads the
 * tokens with the caller's service-role client (RLS would hide other
 * users' rows — the caller here is trusted server code acting for the
 * order's owner), posts to the Expo Push Service in 100-message
 * chunks, and prunes DeviceNotRegistered tokens.
 *
 * NEVER throws — returns a summary and logs failures instead.
 */
export async function sendPushToUser(
  adminClient: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<PushSendSummary> {
  const summary: PushSendSummary = { sent: 0, pruned: 0, errors: 0 };
  try {
    const { data, error } = await adminClient
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", userId);
    if (error) {
      console.error("[push] could not load tokens (nothing sent):", error.message);
      return summary;
    }
    const tokens = (data ?? [])
      .map((row) => (row as { expo_push_token: string }).expo_push_token)
      .filter((t) => isExpoPushToken(t));
    if (tokens.length === 0) return summary;

    const tokenChunks = chunkArray(tokens, PUSH_CHUNK_SIZE);
    const messageChunks = chunkArray(
      buildPushMessages(tokens, payload),
      PUSH_CHUNK_SIZE,
    );

    for (let c = 0; c < messageChunks.length; c += 1) {
      const chunkTokens = tokenChunks[c];
      let tickets: ExpoPushTicket[] = [];
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(messageChunks[c]),
        });
        const json = (await res.json().catch(() => null)) as {
          data?: ExpoPushTicket[];
        } | null;
        if (!res.ok || !json || !Array.isArray(json.data)) {
          console.error(
            `[push] Expo Push Service answered ${res.status} without tickets; chunk of ${chunkTokens.length} counted as errors.`,
          );
          summary.errors += chunkTokens.length;
          continue;
        }
        tickets = json.data;
      } catch (err) {
        console.error("[push] Expo Push Service unreachable:", err);
        summary.errors += chunkTokens.length;
        continue;
      }

      summary.sent += tickets.filter((t) => t?.status === "ok").length;
      const dead = tokensToPrune(chunkTokens, tickets);
      summary.errors += tickets.filter(
        (t) =>
          t?.status === "error" && t.details?.error !== "DeviceNotRegistered",
      ).length;

      if (dead.length > 0) {
        const { error: pruneError } = await adminClient
          .from("push_tokens")
          .delete()
          .in("expo_push_token", dead);
        if (pruneError) {
          console.error("[push] could not prune dead tokens:", pruneError.message);
        } else {
          summary.pruned += dead.length;
        }
      }
    }
  } catch (err) {
    console.error("[push] send failed (status change kept):", err);
  }
  return summary;
}
