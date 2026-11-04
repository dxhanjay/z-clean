import type { SupabaseClient } from "@supabase/supabase-js";
import {
  catalogueKey,
  localCatalogue,
  resolveLocalCoupon,
  type CatalogueEntry,
  type CouponInfo,
} from "@/lib/totals";

/**
 * Server-side price & coupon sources for POST /api/orders.
 *
 * When Supabase is configured the DATABASE is the price source of truth
 * (price_items joined to services) and coupons come from the `coupons`
 * table — the client's numbers are never trusted. When Supabase is not
 * configured, the route still validates + re-calculates against the
 * approved local catalogue before answering 503 { mode: "demo" }, so
 * validation behaviour (incl. total-mismatch rejection) is identical in
 * both modes.
 */

export interface ServerCatalogue {
  entries: CatalogueEntry[];
  /** price_item_id lookup, only present in live (DB) mode. */
  priceItemIds: Map<string, string> | null;
  fromDatabase: boolean;
}

export async function loadCatalogue(
  supabase: SupabaseClient | null,
): Promise<ServerCatalogue> {
  if (!supabase) {
    return { entries: localCatalogue, priceItemIds: null, fromDatabase: false };
  }

  const { data, error } = await supabase
    .from("price_items")
    .select("id, item_name, price_paise, express_multiplier, services ( slug )")
    .eq("active", true);

  if (error || !data) {
    // DB configured but unreadable: fall back to the approved local list
    // rather than trusting anything the client sent.
    return { entries: localCatalogue, priceItemIds: null, fromDatabase: false };
  }

  const entries: CatalogueEntry[] = [];
  const priceItemIds = new Map<string, string>();
  for (const row of data as unknown as Array<{
    id: string;
    item_name: string;
    price_paise: number;
    express_multiplier: number;
    services: { slug: string } | { slug: string }[] | null;
  }>) {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    if (!svc?.slug) continue;
    const local = localCatalogue.find(
      (e) => e.serviceSlug === svc.slug && e.itemName === row.item_name,
    );
    entries.push({
      serviceSlug: svc.slug,
      itemName: row.item_name,
      pricePaise: row.price_paise,
      unitLabel: local?.unitLabel ?? "per piece",
      expressMultiplier: Number(row.express_multiplier) || 1.5,
    });
    priceItemIds.set(catalogueKey(svc.slug, row.item_name), row.id);
  }

  if (entries.length === 0) {
    return { entries: localCatalogue, priceItemIds: null, fromDatabase: false };
  }
  return { entries, priceItemIds, fromDatabase: true };
}

export interface ResolvedCoupon {
  coupon: CouponInfo | null;
  /** coupons.id, only in live mode when the coupon was found in the DB. */
  couponId: string | null;
}

/** Resolve a coupon code: DB table in live mode, approved local terms otherwise. */
export async function resolveCoupon(
  supabase: SupabaseClient | null,
  code: string,
): Promise<ResolvedCoupon> {
  if (!supabase) {
    return { coupon: resolveLocalCoupon(code), couponId: null };
  }
  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, pct_off, first_order_only")
    .eq("code", code.trim().toUpperCase())
    .eq("active", true)
    .maybeSingle();
  if (error || !data) {
    // Live mode: coupons are validated against the table only (RLS makes
    // the table admin-readable; the anon client may see nothing — in that
    // case treat the local approved coupon as the fallback so checkout is
    // not blocked by policy configuration).
    return { coupon: resolveLocalCoupon(code), couponId: null };
  }
  return {
    coupon: {
      code: data.code,
      pctOff: data.pct_off,
      firstOrderOnly: data.first_order_only,
    },
    couponId: data.id,
  };
}

/** Razorpay test/live keys configured? (server-side only). */
export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Create a Razorpay order via the official Orders API (server-side, Basic
 * auth with the key pair). Returns the gateway order, or null on failure.
 */
export async function createRazorpayOrder(args: {
  amountPaise: number;
  receipt: string;
}): Promise<RazorpayOrderResponse | null> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: args.amountPaise,
        currency: "INR",
        receipt: args.receipt,
        payment_capture: 1,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as RazorpayOrderResponse;
  } catch {
    return null;
  }
}
