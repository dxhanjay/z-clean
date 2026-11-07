/**
 * Sri Clean pricing — single typed source for the APPROVED price list.
 *
 * Mirrors ~/workspace/z-clean/PRICE_LIST_DRAFT.md and the Supabase seed in
 * supabase/seed_demo.sql (price_items, integer paise). The rates were
 * drafted from published Indian market ranges and APPROVED by the owner
 * on 2026-11-04 as Sri Clean's Bokaro Steel City price list. When Supabase
 * is connected, the database (admin-editable) is the source of truth and
 * this module is only the offline/demo fallback.
 */

export interface PriceItem {
  /** Matches price_items.item_name in the seed. */
  itemName: string;
  serviceSlug: string;
  /** Price in whole rupees (display). Paise = priceInr * 100. */
  priceInr: number;
  unitLabel: string;
  note?: string;
}

export interface PriceGroup {
  title: string;
  serviceSlug: string;
  unitNote: string;
  items: PriceItem[];
}

const item = (
  serviceSlug: string,
  itemName: string,
  priceInr: number,
  unitLabel: string,
  note?: string,
): PriceItem => ({ serviceSlug, itemName, priceInr, unitLabel, note });

export const priceGroups: PriceGroup[] = [
  {
    title: "Laundry by weight",
    serviceSlug: "laundry-wash-and-fold",
    unitNote: "Charged per kg, weighed at pickup",
    items: [
      item("laundry-wash-and-fold", "Wash & Fold", 70, "per kg"),
      item("wash-and-iron", "Wash & Iron", 110, "per kg"),
    ],
  },
  {
    title: "Dry cleaning",
    serviceSlug: "dry-cleaning",
    unitNote: "Charged per piece",
    items: [
      item("dry-cleaning", "Shirt / T-Shirt", 80, "per piece"),
      item("dry-cleaning", "Trouser / Jeans", 90, "per piece"),
      item("dry-cleaning", "Kurta", 90, "per piece"),
      item("dry-cleaning", "Dress", 179, "per piece"),
      item("dry-cleaning", "Blazer / Jacket", 199, "per piece"),
      item("dry-cleaning", "Suit — 2 piece", 299, "per set"),
      item("dry-cleaning", "Suit — 3 piece", 379, "per set"),
      item("dry-cleaning", "Sherwani", 449, "per piece"),
      item("dry-cleaning", "Coat", 249, "per piece"),
      item("dry-cleaning", "Sweater / Sweatshirt", 149, "per piece"),
      item("dry-cleaning", "Saree — plain / cotton", 199, "per piece"),
      item("dry-cleaning", "Saree — heavy / silk / embroidered", 299, "per piece"),
      item("dry-cleaning", "Lehenga — regular", 499, "per piece"),
      item("dry-cleaning", "Lehenga — heavy / bridal", 899, "per piece", "Starting price — confirmed after inspection"),
    ],
  },
  {
    title: "Household",
    serviceSlug: "dry-cleaning",
    unitNote: "Blankets, bedding, curtains and carpets",
    items: [
      item("dry-cleaning", "Blanket — single", 249, "per piece"),
      item("dry-cleaning", "Blanket — double", 349, "per piece"),
      item("dry-cleaning", "Quilt / Rajai — single", 349, "per piece"),
      item("dry-cleaning", "Quilt / Rajai — double", 449, "per piece"),
      item("dry-cleaning", "Bedsheet — single", 99, "per piece"),
      item("dry-cleaning", "Bedsheet — double", 149, "per piece"),
      item("curtain-cleaning", "Curtain", 129, "per panel"),
      item("carpet-cleaning", "Carpet / Rug", 25, "per sq ft"),
    ],
  },
  {
    title: "Steam iron / press only",
    serviceSlug: "steam-iron-press",
    unitNote: "Press-only for pre-washed garments, per piece",
    items: [
      item("steam-iron-press", "Shirt / T-Shirt / Trouser / Kurta", 15, "per piece"),
      item("steam-iron-press", "Saree", 49, "per piece"),
      item("steam-iron-press", "Suit — 2 piece (press)", 50, "per set"),
    ],
  },
  {
    title: "Shoe cleaning",
    serviceSlug: "shoe-cleaning",
    unitNote: "Charged per pair",
    items: [
      item("shoe-cleaning", "Canvas shoes", 249, "per pair"),
      item("shoe-cleaning", "Sneakers / Sports shoes", 299, "per pair"),
      item("shoe-cleaning", "Leather shoes", 399, "per pair"),
      item("shoe-cleaning", "Suede shoes", 449, "per pair"),
    ],
  },
  {
    title: "Leather care",
    serviceSlug: "leather-care",
    unitNote: "Final quote confirmed after inspection at pickup",
    items: [
      item("leather-care", "Leather jacket (clean + condition)", 499, "per piece"),
      item("leather-care", "Leather bag", 399, "per piece"),
      item("leather-care", "Wallet / small leather accessory", 199, "per piece"),
    ],
  },
];

export const allPriceItems: PriceItem[] = priceGroups.flatMap((g) => g.items);

/** Approved commercial terms — see PRICE_LIST_DRAFT.md (approved 2026-11-04). */
export const pricingTerms = {
  expressMultiplier: 1.5,
  minimumOrderInr: 199,
  freeDeliveryThresholdInr: 299,
  deliveryFeeBelowThresholdInr: 40,
  firstOrderCoupon: { code: "FIRST20", pctOff: 20, firstOrderOnly: true },
} as const;

/* ------------------------------------------------------------------ */
/* Effective commercial terms — the pricingTerms above are the        */
/* approved defaults. The owner can override the minimum order and    */
/* the free-delivery threshold in /admin/settings; those values live  */
/* in the `settings` table as paise strings                         */
/* (minimum_order_paise, free_delivery_threshold_paise) and are read  */
/* server-side by getPricingTerms() (src/lib/business-settings.ts),   */
/* which resolves them through the pure helpers below. The delivery   */
/* FEE itself has no settings key and always comes from pricingTerms. */
/* ------------------------------------------------------------------ */

export interface PricingTermsPaise {
  /** Minimum order (pre-discount subtotal), integer paise. */
  minimumOrderPaise: number;
  /** Net (after discount) at or above which delivery is free, integer paise. */
  freeDeliveryThresholdPaise: number;
}

/** The approved defaults expressed in paise. */
export const defaultPricingTermsPaise: PricingTermsPaise = {
  minimumOrderPaise: pricingTerms.minimumOrderInr * 100,
  freeDeliveryThresholdPaise: pricingTerms.freeDeliveryThresholdInr * 100,
};

/**
 * Public payload for GET /api/pricing-terms — the money terms any client
 * (mobile app, future integrations) needs to mirror the server totals
 * engine. The delivery fee has no settings key today, so it comes from
 * the approved constants.
 */
export interface PublicPricingTerms extends PricingTermsPaise {
  deliveryFeePaise: number;
}

export function publicPricingTermsPayload(
  terms: PricingTermsPaise,
): PublicPricingTerms {
  return {
    minimumOrderPaise: terms.minimumOrderPaise,
    freeDeliveryThresholdPaise: terms.freeDeliveryThresholdPaise,
    deliveryFeePaise: pricingTerms.deliveryFeeBelowThresholdInr * 100,
  };
}

/**
 * Parse one stored settings value into paise. Returns null for anything
 * that is not a sane amount — missing/empty, non-numeric, fractional
 * paise, zero/negative, or absurdly large — so a corrupt or half-filled
 * settings row can never break or distort checkout.
 */
export function parsePaiseSetting(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n <= 0 || n > 100_000_000) return null;
  return n;
}

export interface ResolvedPricingTerms extends PricingTermsPaise {
  /** True when at least one value came from the settings rows. */
  fromDatabase: boolean;
}

/**
 * Resolve the effective terms from raw `settings` rows. Each key falls
 * back INDEPENDENTLY to the approved constants: the base schema seeds
 * free_delivery_threshold_paise as NULL and does not seed
 * minimum_order_paise at all, so a partial table is normal, not an
 * error. Pure — unit-tested in scripts/test-pricing-settings.mjs.
 */
export function resolvePricingTerms(
  rows: readonly { key: string; value: string | null }[] | null | undefined,
): ResolvedPricingTerms {
  const byKey = new Map((rows ?? []).map((r) => [r.key, r.value]));
  const minimumOrderPaise = parsePaiseSetting(byKey.get("minimum_order_paise"));
  const freeDeliveryThresholdPaise = parsePaiseSetting(
    byKey.get("free_delivery_threshold_paise"),
  );
  return {
    minimumOrderPaise: minimumOrderPaise ?? defaultPricingTermsPaise.minimumOrderPaise,
    freeDeliveryThresholdPaise:
      freeDeliveryThresholdPaise ?? defaultPricingTermsPaise.freeDeliveryThresholdPaise,
    fromDatabase: minimumOrderPaise !== null || freeDeliveryThresholdPaise !== null,
  };
}

export function formatInr(amountInr: number): string {
  return `₹${amountInr.toLocaleString("en-IN")}`;
}

/** Format integer paise for display, e.g. 29900 → "₹299", 26850 → "₹268.50". */
export function formatPaise(paise: number): string {
  const inr = paise / 100;
  return `₹${inr.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(inr) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ------------------------------------------------------------------ */
/* Demo service areas — Bokaro Steel City (mirrors supabase seed).     */
/* Pincodes verified against India Post listings, Nov 2026.            */
/* ------------------------------------------------------------------ */

export interface ServiceArea {
  area: string;
  city: string;
  pincode: string;
}

export const DEMO_CITY = "Bokaro Steel City";

export const serviceAreas: ServiceArea[] = [
  { area: "Sector 1", city: DEMO_CITY, pincode: "827001" },
  { area: "Sector 2", city: DEMO_CITY, pincode: "827001" },
  { area: "Sector 3", city: DEMO_CITY, pincode: "827003" },
  { area: "Sector 4 / City Centre", city: DEMO_CITY, pincode: "827004" },
  { area: "Sector 6", city: DEMO_CITY, pincode: "827006" },
  { area: "Sector 8", city: DEMO_CITY, pincode: "827009" },
  { area: "Sector 9", city: DEMO_CITY, pincode: "827009" },
  { area: "Chas", city: DEMO_CITY, pincode: "827013" },
  { area: "Balidih", city: DEMO_CITY, pincode: "827010" },
  { area: "Balidih Industrial Area", city: DEMO_CITY, pincode: "827010" },
  { area: "Bokaro Station (Marafari)", city: DEMO_CITY, pincode: "827010" },
  { area: "Tanr Balidih", city: DEMO_CITY, pincode: "827014" },
  { area: "Jaina More", city: DEMO_CITY, pincode: "829301" },
];

export const serviceablePincodes: string[] = Array.from(
  new Set(serviceAreas.map((a) => a.pincode)),
);

export function isPincodeServiceable(pincode: string): boolean {
  return serviceablePincodes.includes(pincode.trim());
}

export function areasForPincode(pincode: string): ServiceArea[] {
  return serviceAreas.filter((a) => a.pincode === pincode.trim());
}
