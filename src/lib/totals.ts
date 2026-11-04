/**
 * Z-clean order totals engine — SINGLE source of truth for order maths.
 *
 * Used by:
 *  - the order builder UI (live price preview in the browser),
 *  - POST /api/orders (server RE-calculates from catalogue data and rejects
 *    any order whose client-sent total does not match),
 *  - scripts/test-totals.mjs (plain-node assertions over this module).
 *
 * Rules (approved price list, PRICE_LIST_DRAFT.md — approved 2026-11-04):
 *  - All money is integer paise. Unit prices come from the catalogue.
 *  - Express delivery multiplies each item's unit price by its express
 *    multiplier (1.5), rounded to the nearest paise, BEFORE qty.
 *  - Line total = round(unit price × qty) — qty may be fractional
 *    (kg / sq ft items are weighed / measured).
 *  - Minimum order: subtotal (pre-discount) must be ≥ ₹199.
 *  - Coupon FIRST20: 20% off the subtotal, first order only.
 *  - Delivery fee: free when (subtotal − discount) ≥ ₹299, else ₹40.
 *  - Total = subtotal − discount + delivery fee.
 */

import { allPriceItems, pricingTerms } from "./pricing";

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

/** Local catalogue built from the approved price list (src/lib/pricing.ts). */
export const localCatalogue: CatalogueEntry[] = allPriceItems.map((p) => ({
  serviceSlug: p.serviceSlug,
  itemName: p.itemName,
  pricePaise: Math.round(p.priceInr * 100),
  unitLabel: p.unitLabel,
  expressMultiplier: pricingTerms.expressMultiplier,
}));

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

/**
 * Resolve a coupon code against the approved local terms. The server
 * resolves coupons from the `coupons` table instead when Supabase is
 * configured; this helper is for the client preview and demo mode.
 * Returns the coupon, or null when the code is unknown.
 */
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
  /**
   * Resolved coupon for `couponCode`. Pass the result of a catalogue/DB
   * lookup: a CouponInfo when the code exists, null when a code was given
   * but is unknown. Ignored when no couponCode is given. When omitted and a
   * code IS given, the local approved coupon is used.
   */
  coupon?: CouponInfo | null;
  /** Whether this is the customer's first order (for first-order coupons). */
  isFirstOrder: boolean;
  /** Price source. Defaults to the approved local catalogue. */
  catalogue?: CatalogueEntry[];
}

export function computeOrderTotals(args: ComputeOrderTotalsArgs): TotalsResult {
  const catalogue = args.catalogue ?? localCatalogue;

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

  if (subtotalPaise < pricingTerms.minimumOrderInr * 100) {
    return {
      ok: false,
      code: "MIN_ORDER",
      error: `Minimum order is ₹${pricingTerms.minimumOrderInr}. Your items add up to ₹${(subtotalPaise / 100).toFixed(2)} — please add a little more.`,
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
    netPaise >= pricingTerms.freeDeliveryThresholdInr * 100
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
