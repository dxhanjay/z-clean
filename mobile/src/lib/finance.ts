/**
 * Finance labels + helpers (Mobile Phase 3) — ported from the web
 * app's src/lib/finance.ts (PAYMENT_METHOD_LABELS,
 * EXPENSE_CATEGORIES / EXPENSE_CATEGORY_LABELS, RECORDABLE_METHODS,
 * REFUND_METHODS, istToday) so app and web always speak identically.
 * Money is integer paise everywhere; ₹ inputs convert with the web's
 * exact rule: Number(value) then Math.round(n * 100).
 */

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

/** Methods staff may pick when recording a payment by hand. */
export const RECORDABLE_METHODS = ["cash", "upi", "card_machine", "bank_transfer"] as const;

/** Methods a refund may be handed back by. */
export const REFUND_METHODS = ["cash", "upi", "original_payment"] as const;

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

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  detergent: "Detergent & chemicals",
  utilities: "Utilities",
  rent: "Rent",
  fuel: "Fuel & transport",
  packaging: "Packaging",
  maintenance: "Maintenance",
  salary: "Salaries",
  other: "Other",
};

/** Web rule (AdminFinance/AdminOrderPayments rupeesToPaise): null when not a finite, non-negative number. */
export function rupeesToPaise(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Today's date (yyyy-mm-dd) in Asia/Kolkata — the web's istToday(). */
export function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shift a yyyy-mm-dd date by whole days (for the finance date stepper). */
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
