/**
 * Finance math (Phase 9, Requirements v2 §2 item 6) — PURE module.
 *
 * The one place that answers "how much has this order actually paid,
 * how much is still owed, and how much could still be refunded". The
 * API routes, the finance overview, the reports and the demo-mode
 * stores all run these same functions, so the numbers can never drift
 * between screens.
 *
 * THE PAID-TOTAL RULE (read before touching):
 *   base paid = Σ payments.status = 'paid'  (the v1 gateway table —
 *               Razorpay rows AND, since Phase 7b, gift-card rows with
 *               gateway = 'voucher')
 *             + Σ payment_entries of type 'payment'  (the v2 staff
 *               ledger: cash / UPI / card machine / bank transfer)
 *
 *   orders.voucher_redeemed_paise is a MIRROR of the voucher rows in
 *   `payments`. It is NEVER added here — doing so would count every
 *   gift-card rupee twice.
 *
 * LEGACY RULE: v1 orders were marked payment_status = 'paid' by the
 * COD-collection action (and the Phase 8 delivery handover) without any
 * ledger rows. When an order says 'paid' (or 'refunded' — it was
 * settled, then money went back) but the ledger base is below the
 * total, the order still counts as settled in full and `legacySettled`
 * is set, so the UI can say "settled before the ledger existed"
 * instead of inventing a shortfall.
 *
 * REFUNDS: money handed back does NOT reopen the bill, so refunds never
 * change `outstandingPaise`. They reduce what can still be refunded:
 *   refundable = effectivePaid − processed refunds − pending refunds
 * (pending = refund requests in status 'requested' or 'approved';
 * 'processed' refunds are already represented by their ledger entries,
 * and 'rejected' ones release their hold.)
 *
 * Money is integer paise everywhere.
 */

export const PAYMENT_ENTRY_METHODS = [
  "cash",
  "upi",
  "card_machine",
  "bank_transfer",
  "razorpay",
  "voucher",
] as const;
export type PaymentEntryMethod = (typeof PAYMENT_ENTRY_METHODS)[number];

/** Methods staff may pick when recording a payment by hand. */
export const RECORDABLE_METHODS = [
  "cash",
  "upi",
  "card_machine",
  "bank_transfer",
] as const;
export type RecordableMethod = (typeof RECORDABLE_METHODS)[number];

export const REFUND_METHODS = ["cash", "upi", "original_payment"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const REFUND_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "processed",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  "detergent",
  "utilities",
  "rent",
  "fuel",
  "packaging",
  "maintenance",
  "salary",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card_machine: "Card machine",
  bank_transfer: "Bank transfer",
  razorpay: "Razorpay (online)",
  voucher: "Gift card",
  original_payment: "Original payment method",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method.replaceAll("_", " ");
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  detergent: "Detergent & chemicals",
  utilities: "Utilities",
  rent: "Rent",
  fuel: "Fuel & transport",
  packaging: "Packaging",
  maintenance: "Maintenance",
  salary: "Salaries",
  other: "Other",
};

/* ------------------------------------------------------------------ */
/* Shapes (structural — DB rows and demo rows both fit)                */
/* ------------------------------------------------------------------ */

export interface FinanceOrderLike {
  totalPaise: number;
  paymentStatus: string;
}

export interface GatewayPaymentLike {
  amountPaise: number;
  /** gateway_payment_status: 'created' | 'paid' | 'failed' | 'refunded'. */
  status: string;
  gateway?: string | null;
}

export interface PaymentEntryLike {
  entryType: "payment" | "refund";
  method: string;
  amountPaise: number;
}

export interface RefundLike {
  amountPaise: number;
  status: string;
}

export interface OrderFinance {
  totalPaise: number;
  /** Paid rows in the v1 gateway table (Razorpay + gift cards). */
  gatewayPaidPaise: number;
  /** 'payment' rows in the v2 staff ledger. */
  entriesPaidPaise: number;
  /** gateway + entries, before the legacy rule. */
  basePaidPaise: number;
  /** True when the legacy rule lifted the paid total to the full bill. */
  legacySettled: boolean;
  /** The paid total every screen should use. */
  effectivePaidPaise: number;
  /** max(0, total − effective). Refunds never change this. */
  outstandingPaise: number;
  /** Refund entries actually handed back (payment_entries 'refund'). */
  refundsProcessedPaise: number;
  /** Refund requests holding money: status requested or approved. */
  refundsPendingPaise: number;
  /** effective − processed − pending, clamped at 0. */
  refundablePaise: number;
}

export function computeOrderFinance(
  order: FinanceOrderLike,
  gatewayPayments: GatewayPaymentLike[],
  entries: PaymentEntryLike[],
  refunds: RefundLike[],
): OrderFinance {
  const totalPaise = Math.max(0, order.totalPaise);
  const gatewayPaidPaise = gatewayPayments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + Math.max(0, p.amountPaise), 0);
  const entriesPaidPaise = entries
    .filter((e) => e.entryType === "payment")
    .reduce((sum, e) => sum + Math.max(0, e.amountPaise), 0);
  const basePaidPaise = gatewayPaidPaise + entriesPaidPaise;

  const legacySettled =
    (order.paymentStatus === "paid" || order.paymentStatus === "refunded") &&
    basePaidPaise < totalPaise;
  const effectivePaidPaise = legacySettled ? totalPaise : basePaidPaise;

  const refundsProcessedPaise = entries
    .filter((e) => e.entryType === "refund")
    .reduce((sum, e) => sum + Math.max(0, e.amountPaise), 0);
  const refundsPendingPaise = refunds
    .filter((r) => r.status === "requested" || r.status === "approved")
    .reduce((sum, r) => sum + Math.max(0, r.amountPaise), 0);

  return {
    totalPaise,
    gatewayPaidPaise,
    entriesPaidPaise,
    basePaidPaise,
    legacySettled,
    effectivePaidPaise,
    outstandingPaise: Math.max(0, totalPaise - effectivePaidPaise),
    refundsProcessedPaise,
    refundsPendingPaise,
    refundablePaise: Math.max(
      0,
      effectivePaidPaise - refundsProcessedPaise - refundsPendingPaise,
    ),
  };
}

/**
 * The payment_status an order SHOULD carry after a money event, or
 * null when the event changes nothing (no money recorded yet — the
 * order keeps its pending / cod_pending / failed state).
 *
 * Fully refunded wins over paid: when every effective rupee has been
 * handed back, the order is 'refunded', not 'paid'.
 */
export function decidePaymentStatus(finance: OrderFinance): string | null {
  if (
    finance.effectivePaidPaise > 0 &&
    finance.refundsProcessedPaise >= finance.effectivePaidPaise
  ) {
    return "refunded";
  }
  if (finance.totalPaise > 0 && finance.outstandingPaise === 0) return "paid";
  if (finance.effectivePaidPaise > 0) return "partially_paid";
  return null;
}

/* ------------------------------------------------------------------ */
/* IST day boundaries (Asia/Kolkata is UTC+05:30, no DST — ever)       */
/* ------------------------------------------------------------------ */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface IstDayRange {
  /** Inclusive start, UTC ISO string. */
  startUtc: string;
  /** Exclusive end, UTC ISO string. */
  endUtc: string;
  date: string;
}

/** The UTC window covering one Asia/Kolkata calendar date (YYYY-MM-DD). */
export function istDayRangeUtc(date: string): IstDayRange {
  const [y, m, d] = date.split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(startMs + 24 * 60 * 60 * 1000).toISOString(),
    date,
  };
}

/** Today's date in Asia/Kolkata, YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** True when an ISO timestamp falls inside the given IST calendar date. */
export function isInIstDay(isoTimestamp: string, date: string): boolean {
  const range = istDayRangeUtc(date);
  return isoTimestamp >= range.startUtc && isoTimestamp < range.endUtc;
}

/**
 * Expected cash for a day, from the staff ledger ONLY: cash payments
 * taken minus cash refunds handed back. (Gateway-table rows are online
 * or gift-card money — never physical cash.)
 */
export function expectedCashPaise(entries: PaymentEntryLike[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.method !== "cash") continue;
    total += e.entryType === "payment" ? e.amountPaise : -e.amountPaise;
  }
  return total;
}

/** Collections grouped by method from gateway rows + ledger entries. */
export interface MethodCollections {
  method: string;
  gatewayPaise: number;
  entriesPaise: number;
  totalPaise: number;
}

export function collectionsByMethod(
  gatewayPayments: GatewayPaymentLike[],
  entries: PaymentEntryLike[],
): MethodCollections[] {
  const byMethod = new Map<string, MethodCollections>();
  const row = (method: string) => {
    let r = byMethod.get(method);
    if (!r) {
      r = { method, gatewayPaise: 0, entriesPaise: 0, totalPaise: 0 };
      byMethod.set(method, r);
    }
    return r;
  };
  for (const p of gatewayPayments) {
    if (p.status !== "paid") continue;
    const r = row(p.gateway ?? "razorpay");
    r.gatewayPaise += Math.max(0, p.amountPaise);
    r.totalPaise += Math.max(0, p.amountPaise);
  }
  for (const e of entries) {
    if (e.entryType !== "payment") continue;
    const r = row(e.method);
    r.entriesPaise += Math.max(0, e.amountPaise);
    r.totalPaise += Math.max(0, e.amountPaise);
  }
  return [...byMethod.values()].sort((a, b) => b.totalPaise - a.totalPaise);
}

/* ------------------------------------------------------------------ */
/* Pending-order aging                                                 */
/* ------------------------------------------------------------------ */

export const AGING_BUCKETS = ["0–1 days", "2–3 days", "4–7 days", "Over 7 days"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Whole days between an ISO timestamp and `now`, floored, min 0. */
export function ageInDays(createdAtIso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function agingBucket(createdAtIso: string, now: Date = new Date()): AgingBucket {
  const days = ageInDays(createdAtIso, now);
  if (days <= 1) return "0–1 days";
  if (days <= 3) return "2–3 days";
  if (days <= 7) return "4–7 days";
  return "Over 7 days";
}

/** ₹ formatting for ledger notes (Indian grouping, whole rupees when exact). */
export function formatMoneyPaise(paise: number): string {
  const sign = paise < 0 ? "−" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = rupees.toLocaleString("en-IN");
  return rem === 0
    ? `${sign}₹${grouped}`
    : `${sign}₹${grouped}.${String(rem).padStart(2, "0")}`;
}
