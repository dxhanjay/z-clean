/**
 * Dashboard analytics (Delta 1) — PURE.
 *
 * The math behind GET /api/admin/analytics and the dashboard charts:
 * orders and collected revenue bucketed into Asia/Kolkata calendar
 * days, plus a per-status order breakdown. The route (live) and the
 * demo dashboard feed the same functions, so the two modes can never
 * disagree about how a number is made — the same discipline as
 * src/lib/reports.ts.
 *
 * Revenue here means REAL collected money: `payment_entries` rows of
 * entry_type 'payment' (the staff ledger) — the caller fetches them;
 * this module only buckets. Days with no activity are present with
 * honest zeros (the charts render them), never skipped.
 */

import { ALL_ORDER_STATUSES } from "./order-flow";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Asia/Kolkata calendar date (YYYY-MM-DD) of an instant. */
export function istDateOf(isoTimestamp: string): string {
  return new Date(new Date(isoTimestamp).getTime() + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** YYYY-MM-DD `days-1` days before `date`, both plain calendar dates. */
function dateMinus(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export interface DailyPoint {
  /** Asia/Kolkata calendar date, YYYY-MM-DD. */
  date: string;
  orders: number;
  revenuePaise: number;
}

export interface BucketInput {
  orders: { createdAt: string }[];
  revenue: { createdAt: string; amountPaise: number }[];
}

/**
 * The last `days` IST calendar days ending today (inclusive), oldest
 * first, with order counts and revenue sums bucketed by IST day.
 * Rows outside the window are ignored; invalid amounts count as 0.
 */
export function bucketDailySeries(
  input: BucketInput,
  days: number,
  now: Date = new Date(),
): DailyPoint[] {
  const count = Math.max(1, Math.floor(days) || 1);
  const today = istDateOf(now.toISOString());
  const byDate = new Map<string, DailyPoint>();
  for (let i = count - 1; i >= 0; i--) {
    const date = dateMinus(today, i);
    byDate.set(date, { date, orders: 0, revenuePaise: 0 });
  }
  for (const order of input.orders) {
    const row = byDate.get(istDateOf(order.createdAt));
    if (row) row.orders += 1;
  }
  for (const entry of input.revenue) {
    const row = byDate.get(istDateOf(entry.createdAt));
    if (row) {
      const amount = Number(entry.amountPaise);
      row.revenuePaise += Number.isFinite(amount) && amount > 0 ? amount : 0;
    }
  }
  return [...byDate.values()];
}

export interface StatusCount {
  status: string;
  count: number;
}

/**
 * Counts per order status. Every known status appears (zeros
 * included, in lifecycle order) so the breakdown chart is stable;
 * unknown statuses found in data are appended after, by count.
 */
export function statusBreakdown(
  orders: { status: string }[],
): StatusCount[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  }
  const known = ALL_ORDER_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
  for (const status of ALL_ORDER_STATUSES) counts.delete(status);
  const unknown = [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
  return [...known, ...unknown];
}
