/**
 * Gift vouchers (Phase 7b — Requirements v2 §3/§4).
 *
 * Two kinds, kept strictly distinct:
 *   - prepaid_card — a stored-balance gift card. Redeeming it is a
 *     PAYMENT: it covers some or all of the amount due and the balance
 *     drops. It never changes the order total.
 *   - promo — a discount instrument. Redeeming it reduces the order total
 *     by a fixed amount or a percentage (optionally capped) and consumes
 *     one of its uses.
 *
 * This module is deliberately dependency-free (no React, no Supabase) so
 * the plain-node test suite (scripts/test-vouchers.mjs) can compile it
 * alone — same discipline as src/lib/org.ts. All money is integer paise.
 *
 * Codes are bearer instruments: the database table is admin-only under
 * RLS and checkout resolves codes exclusively through the server-side
 * service-role client. Nothing in this module touches the database.
 */

export type VoucherKind = "prepaid_card" | "promo";
export type PromoDiscountType = "fixed" | "percent";
export type VoucherStatus =
  | "created"
  | "issued"
  | "partially_redeemed"
  | "redeemed"
  | "expired"
  | "cancelled";

export const VOUCHER_STATUSES: VoucherStatus[] = [
  "created",
  "issued",
  "partially_redeemed",
  "redeemed",
  "expired",
  "cancelled",
];

export interface GiftVoucher {
  id: string;
  code: string;
  kind: VoucherKind;
  /** Prepaid only: original face value, integer paise. */
  faceValuePaise: number | null;
  /** Prepaid only: remaining balance, integer paise. */
  balancePaise: number | null;
  /** Promo only. */
  discountType: PromoDiscountType | null;
  /** Promo only: paise when 'fixed', whole percent when 'percent'. */
  discountValue: number | null;
  /** Promo percent cap, integer paise. */
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  /** Service slugs; empty = every service is eligible. */
  eligibleServices: string[];
  branchId: string | null;
  usageLimit: number;
  timesUsed: number;
  status: VoucherStatus;
  issuedToName: string | null;
  issuedToPhone: string | null;
  issuedToEmployeeId: string | null;
  issuedByLabel: string | null;
  /** ISO dates (YYYY-MM-DD) or null for open-ended. */
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Code generation — ZCGIFT-XXXXXXXX                                   */
/* ------------------------------------------------------------------ */

/** Unambiguous alphabet: no 0/O, no 1/I/L, no confusing pairs. */
export const VOUCHER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const VOUCHER_CODE_PREFIX = "ZCGIFT-";
export const VOUCHER_CODE_BODY_LENGTH = 8;
export const VOUCHER_CODE_RE = /^ZCGIFT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/**
 * Generate one voucher code. `nextInt` is injectable for tests; the
 * default uses crypto-grade randomness (Web Crypto, available in the
 * browser, in Node 19+, and in the Next.js runtime).
 */
export function generateVoucherCode(
  nextInt: (maxExclusive: number) => number = defaultNextInt,
): string {
  let body = "";
  for (let i = 0; i < VOUCHER_CODE_BODY_LENGTH; i += 1) {
    body += VOUCHER_CODE_ALPHABET[nextInt(VOUCHER_CODE_ALPHABET.length)];
  }
  return `${VOUCHER_CODE_PREFIX}${body}`;
}

function defaultNextInt(maxExclusive: number): number {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function isVoucherCodeFormat(code: string): boolean {
  return VOUCHER_CODE_RE.test(code.trim().toUpperCase());
}

export function normaliseVoucherCode(code: string): string {
  return code.trim().toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Coupon conflict (checkout rule: a voucher and a coupon never stack) */
/* ------------------------------------------------------------------ */

export function hasVoucherCouponConflict(
  couponCode?: string | null,
  voucherCode?: string | null,
): boolean {
  return Boolean(couponCode?.trim()) && Boolean(voucherCode?.trim());
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface VoucherContext {
  /** Order subtotal in paise (before discounts), for min-order checks. */
  subtotalPaise: number;
  /** Service slugs present in the order. */
  serviceSlugs: string[];
  /**
   * The amount a prepaid card may be applied against (order total at
   * checkout; outstanding amount at the cashier desk). Defaults to
   * subtotalPaise.
   */
  amountDuePaise?: number;
  /** Branch the redemption happens at, when a branch context exists. */
  branchId?: string | null;
  /** Evaluation instant; defaults to now. */
  now?: Date;
}

export type VoucherValidation =
  | {
      ok: true;
      kind: VoucherKind;
      /** Promo only: discount to take off the order total. */
      discountPaise: number;
      /** Prepaid only: amount the card will pay now. */
      redeemablePaise: number;
    }
  | { ok: false; kind: VoucherKind; reasons: string[] };

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Validate a voucher for a redemption and compute its effect. Pure: the
 * caller loads the voucher row (server-side) and applies the returned
 * effect. Every failed rule contributes a human-readable reason.
 *
 * Branch rule: a branch-restricted voucher is rejected when the
 * redemption context names a DIFFERENT branch. Contexts without a
 * branch (today's checkout — orders are not branch-scoped until the
 * Phase 8 stage queues) do not silently widen eligibility elsewhere:
 * the restriction is recorded on the voucher and enforced wherever a
 * branch context exists.
 */
export function validateVoucher(
  voucher: GiftVoucher,
  ctx: VoucherContext,
): VoucherValidation {
  const reasons: string[] = [];
  const now = ctx.now ?? new Date();
  const today = isoDate(now);

  if (voucher.status !== "issued" && voucher.status !== "partially_redeemed") {
    reasons.push(
      voucher.status === "created"
        ? "This voucher has not been issued yet."
        : `This voucher is ${voucher.status.replaceAll("_", " ")} and can no longer be used.`,
    );
  }
  if (voucher.validFrom && today < voucher.validFrom) {
    reasons.push(`This voucher is not valid until ${voucher.validFrom}.`);
  }
  if (voucher.validUntil && today > voucher.validUntil) {
    reasons.push(`This voucher expired on ${voucher.validUntil}.`);
  }
  if (ctx.subtotalPaise < voucher.minOrderPaise) {
    reasons.push(
      `This voucher needs an order of at least ₹${(voucher.minOrderPaise / 100).toLocaleString("en-IN")}.`,
    );
  }
  if (voucher.eligibleServices.length > 0) {
    const ineligible = [...new Set(ctx.serviceSlugs)].filter(
      (slug) => !voucher.eligibleServices.includes(slug),
    );
    if (ineligible.length > 0) {
      reasons.push(
        "This voucher only applies to selected services, and this order contains other services.",
      );
    }
  }
  if (voucher.branchId && ctx.branchId && ctx.branchId !== voucher.branchId) {
    reasons.push("This voucher is restricted to a different branch.");
  }

  if (voucher.kind === "promo") {
    if (voucher.timesUsed >= voucher.usageLimit) {
      reasons.push("This voucher has already been used up.");
    }
    if (reasons.length > 0) return { ok: false, kind: voucher.kind, reasons };

    let discountPaise = 0;
    if (voucher.discountType === "fixed" && voucher.discountValue) {
      discountPaise = Math.min(voucher.discountValue, ctx.subtotalPaise);
    } else if (voucher.discountType === "percent" && voucher.discountValue) {
      discountPaise = Math.round((ctx.subtotalPaise * voucher.discountValue) / 100);
      if (voucher.maxDiscountPaise !== null) {
        discountPaise = Math.min(discountPaise, voucher.maxDiscountPaise);
      }
      discountPaise = Math.min(discountPaise, ctx.subtotalPaise);
    }
    return { ok: true, kind: "promo", discountPaise, redeemablePaise: 0 };
  }

  // prepaid_card — balance governs; usage_limit does not apply to cards.
  const balance = voucher.balancePaise ?? 0;
  if (balance <= 0) {
    reasons.push("This gift card has no balance left.");
  }
  if (reasons.length > 0) return { ok: false, kind: voucher.kind, reasons };

  const due = ctx.amountDuePaise ?? ctx.subtotalPaise;
  const redeemablePaise = Math.max(0, Math.min(balance, due));
  if (redeemablePaise <= 0) {
    reasons.push("There is nothing due for this gift card to pay.");
    return { ok: false, kind: voucher.kind, reasons };
  }
  return { ok: true, kind: "prepaid_card", discountPaise: 0, redeemablePaise };
}

/** Status a prepaid card lands in after a redemption of `redeemedPaise`. */
export function prepaidStatusAfter(
  voucher: GiftVoucher,
  redeemedPaise: number,
): { balancePaise: number; status: VoucherStatus } {
  const balancePaise = Math.max(0, (voucher.balancePaise ?? 0) - redeemedPaise);
  return {
    balancePaise,
    status: balancePaise === 0 ? "redeemed" : "partially_redeemed",
  };
}

/** Status a promo voucher lands in after consuming one more use. */
export function promoStatusAfter(voucher: GiftVoucher): VoucherStatus {
  return voucher.timesUsed + 1 >= voucher.usageLimit ? "redeemed" : voucher.status;
}

/* ------------------------------------------------------------------ */
/* DEMO MODE seed data — used ONLY when Supabase is not configured.    */
/* Fictional instruments under the DEMO MODE banner, mirroring the     */
/* org.ts demo pattern: one promo, one prepaid card with balance.      */
/* ------------------------------------------------------------------ */

export interface VoucherTransaction {
  id: string;
  voucherId: string;
  orderId: string | null;
  txnType: "issue" | "redeem" | "adjust" | "cancel" | "expire";
  amountPaise: number;
  balanceAfterPaise: number | null;
  actorLabel: string | null;
  note: string | null;
  createdAt: string;
}

export const DEMO_VOUCHERS: GiftVoucher[] = [
  {
    id: "demo-voucher-promo",
    code: "ZCGIFT-GFTFEST8",
    kind: "promo",
    faceValuePaise: null,
    balancePaise: null,
    discountType: "percent",
    discountValue: 10,
    maxDiscountPaise: 15000,
    minOrderPaise: 29900,
    eligibleServices: [],
    branchId: null,
    usageLimit: 1,
    timesUsed: 0,
    status: "issued",
    issuedToName: "Demo Customer",
    issuedToPhone: "9999999999",
    issuedToEmployeeId: null,
    issuedByLabel: "demo-admin",
    validFrom: "2026-01-01",
    validUntil: "2027-12-31",
    createdAt: "2026-11-04T00:00:00.000Z",
  },
  {
    id: "demo-voucher-card",
    code: "ZCGIFT-TESTCARD",
    kind: "prepaid_card",
    faceValuePaise: 50000,
    balancePaise: 50000,
    discountType: null,
    discountValue: null,
    maxDiscountPaise: null,
    minOrderPaise: 0,
    eligibleServices: [],
    branchId: null,
    usageLimit: 1,
    timesUsed: 0,
    status: "issued",
    issuedToName: "Demo Customer",
    issuedToPhone: "9999999999",
    issuedToEmployeeId: null,
    issuedByLabel: "demo-admin",
    validFrom: null,
    validUntil: null,
    createdAt: "2026-11-04T00:00:00.000Z",
  },
];

export const DEMO_VOUCHER_TRANSACTIONS: VoucherTransaction[] = [
  {
    id: "demo-vtxn-1",
    voucherId: "demo-voucher-promo",
    orderId: null,
    txnType: "issue",
    amountPaise: 0,
    balanceAfterPaise: null,
    actorLabel: "demo-admin",
    note: "Issued to Demo Customer",
    createdAt: "2026-11-04T00:05:00.000Z",
  },
  {
    id: "demo-vtxn-2",
    voucherId: "demo-voucher-card",
    orderId: null,
    txnType: "issue",
    amountPaise: 50000,
    balanceAfterPaise: 50000,
    actorLabel: "demo-admin",
    note: "Issued to Demo Customer",
    createdAt: "2026-11-04T00:05:00.000Z",
  },
];
