/**
 * Admin notifications (Delta 1) — PURE derivation, NO new tables.
 *
 * The notifications view is computed on demand from rows that already
 * exist (refunds, orders, pickup_requests, gift_vouchers,
 * cash_closings + the day's cash activity) — nothing is stored, so a
 * notification can never go stale: fix the underlying thing and the
 * notification disappears on the next read. The route
 * (GET /api/admin/notifications) fetches bounded aggregates through
 * the caller's admin RLS client; this module holds every rule, so
 * the thresholds are testable and documented in one place:
 *
 *   refund_pending     a refund sits in 'requested' awaiting a
 *                      decision                                  → medium
 *   refund_stuck       a refund was approved >24h ago but the money
 *                      has not been handed back yet            → high
 *   order_stuck        PLACED / PICKUP_SCHEDULED unchanged >24h → medium
 *                      PICKED_UP / RECEIVED / IN_PROCESS >72h   → high
 *                      READY waiting >48h                       → medium
 *   payment_failed     a live order carries payment_status
 *                      'failed' (online payment failed, order
 *                      not closed)                               → high
 *   guest_pickup       a GUEST pickup request (no account, not yet
 *                      turned into an order) older than 24h    → low
 *   voucher_expiring   an active voucher (created / issued /
 *                      partially redeemed) whose validity ends
 *                      within 7 days                             → low
 *   closing_missing    yesterday (IST) had cash activity but no
 *                      cash_closings row                         → medium
 *
 * "Age" is always measured from the row's created_at (orders and
 * refunds carry updated_at too, but created_at is the honest
 * "waiting since" for every queue here — the status PATCH route
 * bumps updated_at on every move, and the refund workflow stamps
 * decided_at on approval, which IS used for refund_stuck).
 *
 * Sorted by severity (high → medium → low), then most recent first,
 * capped at 50 items.
 */

export type NotificationSeverity = "high" | "medium" | "low";
export type NotificationKind =
  | "refund_pending"
  | "refund_stuck"
  | "order_stuck"
  | "payment_failed"
  | "guest_pickup"
  | "voucher_expiring"
  | "closing_missing";

export interface AdminNotification {
  /** Stable, kind + source-row id — safe as a React key. */
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  /** Admin route that resolves the item. */
  href: string;
  /** When the underlying thing started waiting (ISO). */
  at: string;
}

export interface NotificationRefund {
  id: string;
  orderId: string;
  amountPaise: number;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  customerLabel?: string | null;
}

export interface NotificationOrder {
  id: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  customerLabel?: string | null;
}

export interface NotificationGuestPickup {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}

export interface NotificationVoucher {
  id: string;
  code: string;
  kind: string;
  status: string;
  /** YYYY-MM-DD (a date column), or null when open-ended. */
  validUntil: string | null;
  balancePaise: number | null;
}

export interface NotificationsInput {
  refunds: NotificationRefund[];
  orders: NotificationOrder[];
  guestPickups: NotificationGuestPickup[];
  vouchers: NotificationVoucher[];
  yesterday: {
    /** Yesterday's Asia/Kolkata calendar date, YYYY-MM-DD. */
    date: string;
    hasCashActivity: boolean;
    hasClosing: boolean;
  };
  now: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function ageHours(fromIso: string, now: Date): number {
  return (now.getTime() - new Date(fromIso).getTime()) / HOUR_MS;
}

function ageLabel(hours: number): string {
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

function money(paise: number): string {
  return `₹${(Math.max(0, paise) / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

/** Whole days from today's IST date until a YYYY-MM-DD date. */
function daysUntilIst(dateStr: string, now: Date): number {
  const todayIst = new Date(now.getTime() + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  const [y1, m1, d1] = todayIst.split("-").map(Number);
  const [y2, m2, d2] = dateStr.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS,
  );
}

const TERMINAL_ORDER_STATUSES = new Set([
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
]);

/** Order-stuck thresholds (hours) per status; unlisted = never stuck. */
const STUCK_THRESHOLDS: Record<
  string,
  { hours: number; severity: NotificationSeverity } | undefined
> = {
  PLACED: { hours: 24, severity: "medium" },
  PICKUP_SCHEDULED: { hours: 24, severity: "medium" },
  PICKED_UP: { hours: 72, severity: "high" },
  RECEIVED: { hours: 72, severity: "high" },
  IN_PROCESS: { hours: 72, severity: "high" },
  READY: { hours: 48, severity: "medium" },
};

export function buildNotifications(
  input: NotificationsInput,
  now: Date = input.now,
): AdminNotification[] {
  const items: AdminNotification[] = [];

  /* Refunds: awaiting a decision, or approved but money not moved. */
  for (const refund of input.refunds) {
    const who = refund.customerLabel?.trim()
      ? ` — ${refund.customerLabel.trim()}`
      : "";
    if (refund.status === "requested") {
      items.push({
        id: `refund_pending:${refund.id}`,
        kind: "refund_pending",
        severity: "medium",
        title: `Refund of ${money(refund.amountPaise)} awaiting approval${who}`,
        detail: `Requested ${ageLabel(ageHours(refund.createdAt, now))} ago · order #${refund.orderId.slice(0, 8)}`,
        href: "/admin/finance",
        at: refund.createdAt,
      });
    } else if (
      refund.status === "approved" &&
      refund.decidedAt &&
      ageHours(refund.decidedAt, now) > 24
    ) {
      items.push({
        id: `refund_stuck:${refund.id}`,
        kind: "refund_stuck",
        severity: "high",
        title: `Approved refund of ${money(refund.amountPaise)} not yet paid out${who}`,
        detail: `Approved ${ageLabel(ageHours(refund.decidedAt, now))} ago · order #${refund.orderId.slice(0, 8)}`,
        href: "/admin/finance",
        at: refund.decidedAt,
      });
    }
  }

  /* Orders: stuck in a stage, or carrying a failed payment. */
  for (const order of input.orders) {
    const who = order.customerLabel?.trim()
      ? ` — ${order.customerLabel.trim()}`
      : "";
    const stuck = STUCK_THRESHOLDS[order.status];
    if (stuck && ageHours(order.createdAt, now) > stuck.hours) {
      items.push({
        id: `order_stuck:${order.id}`,
        kind: "order_stuck",
        severity: stuck.severity,
        title: `Order #${order.id.slice(0, 8)} stuck at ${order.status.replaceAll("_", " ")}${who}`,
        detail: `Waiting ${ageLabel(ageHours(order.createdAt, now))} (threshold ${stuck.hours}h)`,
        href: `/admin/orders/${order.id}`,
        at: order.createdAt,
      });
    }
    if (
      order.paymentStatus === "failed" &&
      !TERMINAL_ORDER_STATUSES.has(order.status)
    ) {
      items.push({
        id: `payment_failed:${order.id}`,
        kind: "payment_failed",
        severity: "high",
        title: `Payment failed for order #${order.id.slice(0, 8)}${who}`,
        detail: "The online payment failed and the order is still open — follow up with the customer.",
        href: `/admin/orders/${order.id}`,
        at: order.createdAt,
      });
    }
  }

  /* Guest pickup requests nobody has picked up yet. */
  for (const pickup of input.guestPickups) {
    if (ageHours(pickup.createdAt, now) <= 24) continue;
    items.push({
      id: `guest_pickup:${pickup.id}`,
      kind: "guest_pickup",
      severity: "low",
      title: `Guest pickup request from ${pickup.name} is waiting`,
      detail: `${pickup.phone} · requested ${ageLabel(ageHours(pickup.createdAt, now))} ago · no account order yet`,
      href: "/admin/orders",
      at: pickup.createdAt,
    });
  }

  /* Active vouchers about to expire. */
  for (const voucher of input.vouchers) {
    if (!voucher.validUntil) continue;
    if (!["created", "issued", "partially_redeemed"].includes(voucher.status)) {
      continue;
    }
    const days = daysUntilIst(voucher.validUntil, now);
    if (days < 0 || days > 7) continue;
    items.push({
      id: `voucher_expiring:${voucher.id}`,
      kind: "voucher_expiring",
      severity: "low",
      title: `Voucher ${voucher.code} expires ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
      detail:
        voucher.kind === "prepaid_card" && voucher.balancePaise
          ? `Prepaid card with ${money(voucher.balancePaise)} still on it`
          : "Promo voucher nearing the end of its validity",
      href: "/admin/vouchers",
      at: now.toISOString(),
    });
  }

  /* Yesterday's cash never closed. */
  if (input.yesterday.hasCashActivity && !input.yesterday.hasClosing) {
    items.push({
      id: `closing_missing:${input.yesterday.date}`,
      kind: "closing_missing",
      severity: "medium",
      title: `Cash day ${input.yesterday.date} was never closed`,
      detail: "Cash moved yesterday but there is no closing record — count the drawer and close the day.",
      href: "/admin/finance",
      at: now.toISOString(),
    });
  }

  items.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.at.localeCompare(a.at),
  );
  return items.slice(0, 50);
}

/** Severity tallies for badges (the topbar bell shows `high`). */
export function notificationCounts(items: AdminNotification[]): {
  total: number;
  high: number;
  medium: number;
  low: number;
} {
  return {
    total: items.length,
    high: items.filter((i) => i.severity === "high").length,
    medium: items.filter((i) => i.severity === "medium").length,
    low: items.filter((i) => i.severity === "low").length,
  };
}
