/**
 * Sri Clean order totals engine — MOBILE PORT (Mobile Phase 1).
 *
 * This is a deliberate copy of the web app's src/lib/totals.ts (the
 * single source of truth for order maths), kept inside the app
 * because the app must not import across the Next.js project
 * boundary. The two implementations MUST stay in lock-step: the app
 * uses this to compute `expectedTotalPaise`, and POST /api/orders
 * re-computes with the web engine and rejects mismatches with 409 —
 * so a drift here shows up immediately as failed orders, never as
 * wrong money.
 *
 * Rules (approved price list, identical to web):
 *  - All money is integer paise. Unit prices come from the catalogue.
 *  - Express multiplies each item's unit price by its express
 *    multiplier (1.5), rounded to the nearest paise, BEFORE qty.
 *  - Line total = round(unit price × qty) — qty may be fractional
 *    (kg / sq ft items are weighed / measured).
 *  - Minimum order: subtotal (pre-discount) must be ≥ ₹199.
 *  - Coupon FIRST20: 20% off the subtotal, first order only.
 *    (The app does not offer a coupon field in Phase 1 — the logic is
 *    ported for parity and stays dormant; gift vouchers are applied
 *    by the server after the total check, exactly like the web.)
 *  - Delivery fee: free when (subtotal − discount) ≥ ₹299, else ₹40.
 *  - Total = subtotal − discount + delivery fee.
 *
 * Unit sanity checks (same cases as the web test suite,
 * scripts/test-totals.mjs — verified against this port):
 *  - 2× Shirt / T-Shirt (₹80) + 1× Trouser / Jeans (₹90), regular:
 *    subtotal 25000, discount 0, fee 4000, total 29000.
 *  - Same items, express (×1.5): units 12000/13500 → subtotal 37500,
 *    fee 0 (≥ ₹299), total 37500.
 *  - Same items + FIRST20 on a first order: discount 5000,
 *    net 20000 < 29900 → fee 4000, total 24000.
 *  - 1× steam-iron shirt (₹15) alone: MIN_ORDER error (₹15 < ₹199).
 *  - Wash & Fold 3 kg × ₹70: line 21000, fee 4000, total 25000.
 *    At 2.5 kg the line is 17500 → MIN_ORDER error.
 */

export interface CatalogueEntry {
  serviceSlug: string;
  itemName: string;
  /** Regular unit price, integer paise. */
  pricePaise: number;
  unitLabel: string;
  /** Express multiplier for this item (1.5 on the approved list). */
  expressMultiplier: number;
}

export interface OrderItemInput {
  serviceSlug: string;
  itemName: string;
  /** Pieces / pairs, or estimated kg / sq ft for weight & area items. */
  qty: number;
}

export interface CouponInfo {
  code: string;
  pctOff: number;
  firstOrderOnly: boolean;
}

export interface OrderLine extends OrderItemInput {
  unitLabel: string;
  /** Unit price actually charged (express-adjusted), integer paise. */
  unitPricePaise: number;
  lineTotalPaise: number;
}

export type TotalsErrorCode =
  | "EMPTY_ORDER"
  | "UNKNOWN_ITEM"
  | "INVALID_QTY"
  | "MIN_ORDER"
  | "INVALID_COUPON"
  | "COUPON_NOT_FIRST_ORDER";

export type TotalsResult =
  | {
      ok: true;
      lines: OrderLine[];
      subtotalPaise: number;
      discountPaise: number;
      deliveryFeePaise: number;
      totalPaise: number;
      couponApplied: string | null;
    }
  | { ok: false; code: TotalsErrorCode; error: string };

/** Approved commercial terms — mirror of web pricingTerms. */
export const pricingTerms = {
  expressMultiplier: 1.5,
  minimumOrderInr: 199,
  freeDeliveryThresholdInr: 299,
  deliveryFeeBelowThresholdInr: 40,
  firstOrderCoupon: { code: "FIRST20", pctOff: 20, firstOrderOnly: true },
} as const;

export function catalogueKey(serviceSlug: string, itemName: string): string {
  return `${serviceSlug}::${itemName}`;
}

export function findCatalogueEntry(
  catalogue: CatalogueEntry[],
  serviceSlug: string,
  itemName: string,
): CatalogueEntry | undefined {
  return catalogue.find(
    (e) => e.serviceSlug === serviceSlug && e.itemName === itemName,
  );
}

/** Resolve a coupon code against the approved local terms (parity with web). */
export function resolveLocalCoupon(code: string): CouponInfo | null {
  const c = pricingTerms.firstOrderCoupon;
  if (code.trim().toUpperCase() === c.code) {
    return { code: c.code, pctOff: c.pctOff, firstOrderOnly: c.firstOrderOnly };
  }
  return null;
}

export interface ComputeOrderTotalsArgs {
  items: OrderItemInput[];
  deliveryType: "regular" | "express";
  /** Coupon code the customer entered, if any. */
  couponCode?: string | null;
  /** Resolved coupon for `couponCode` (see web engine docs). */
  coupon?: CouponInfo | null;
  /** Whether this is the customer's first order (for first-order coupons). */
  isFirstOrder: boolean;
  /** Price source — the app passes its DB-backed catalogue. */
  catalogue: CatalogueEntry[];
  /**
   * Effective money terms from GET /api/pricing-terms (the admin-editable
   * settings, resolved server-side). Optional: each value is honoured
   * only when a positive integer number of paise; otherwise the approved
   * constants in pricingTerms apply — the same fallback discipline as the
   * web engine, so the app can never desync from checkout by more than a
   * failed fetch.
   */
  terms?: {
    minimumOrderPaise?: number;
    freeDeliveryThresholdPaise?: number;
  };
}

export function computeOrderTotals(args: ComputeOrderTotalsArgs): TotalsResult {
  const catalogue = args.catalogue;
  const validPaise = (v: number | undefined): number | null =>
    typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
  const minimumOrderPaise =
    validPaise(args.terms?.minimumOrderPaise) ??
    pricingTerms.minimumOrderInr * 100;
  const freeDeliveryThresholdPaise =
    validPaise(args.terms?.freeDeliveryThresholdPaise) ??
    pricingTerms.freeDeliveryThresholdInr * 100;

  if (!args.items || args.items.length === 0) {
    return { ok: false, code: "EMPTY_ORDER", error: "Your order is empty — add at least one item." };
  }

  const lines: OrderLine[] = [];
  for (const input of args.items) {
    if (!Number.isFinite(input.qty) || input.qty <= 0 || input.qty > 10000) {
      return {
        ok: false,
        code: "INVALID_QTY",
        error: `Enter a valid quantity for ${input.itemName}.`,
      };
    }
    const entry = findCatalogueEntry(catalogue, input.serviceSlug, input.itemName);
    if (!entry) {
      return {
        ok: false,
        code: "UNKNOWN_ITEM",
        error: `We could not find a price for "${input.itemName}". Please refresh and try again.`,
      };
    }
    const unitPricePaise =
      args.deliveryType === "express"
        ? Math.round(entry.pricePaise * entry.expressMultiplier)
        : entry.pricePaise;
    const lineTotalPaise = Math.round(unitPricePaise * input.qty);
    lines.push({
      serviceSlug: input.serviceSlug,
      itemName: input.itemName,
      qty: input.qty,
      unitLabel: entry.unitLabel,
      unitPricePaise,
      lineTotalPaise,
    });
  }

  const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);

  if (subtotalPaise < minimumOrderPaise) {
    return {
      ok: false,
      code: "MIN_ORDER",
      error: `Minimum order is ₹${minimumOrderPaise / 100}. Your items add up to ₹${(subtotalPaise / 100).toFixed(2)} — please add a little more.`,
    };
  }

  let discountPaise = 0;
  let couponApplied: string | null = null;
  const code = args.couponCode?.trim().toUpperCase();
  if (code) {
    const coupon = args.coupon !== undefined ? args.coupon : resolveLocalCoupon(code);
    if (!coupon || coupon.code !== code) {
      return { ok: false, code: "INVALID_COUPON", error: `Coupon "${code}" is not valid.` };
    }
    if (coupon.firstOrderOnly && !args.isFirstOrder) {
      return {
        ok: false,
        code: "COUPON_NOT_FIRST_ORDER",
        error: `Coupon ${code} is for first orders only.`,
      };
    }
    discountPaise = Math.round((subtotalPaise * coupon.pctOff) / 100);
    couponApplied = coupon.code;
  }

  const netPaise = subtotalPaise - discountPaise;
  const deliveryFeePaise =
    netPaise >= freeDeliveryThresholdPaise
      ? 0
      : pricingTerms.deliveryFeeBelowThresholdInr * 100;
  const totalPaise = netPaise + deliveryFeePaise;

  return {
    ok: true,
    lines,
    subtotalPaise,
    discountPaise,
    deliveryFeePaise,
    totalPaise,
    couponApplied,
  };
}
