import { createClient } from "@/lib/supabase/server";
import { businessSettings as configSettings } from "@/lib/config";
import {
  defaultPricingTermsPaise,
  resolvePricingTerms,
  type ResolvedPricingTerms,
} from "@/lib/pricing";

/**
 * Business settings (Phase 7b) — SERVER ONLY.
 *
 * The `settings` table is the owner-editable source for the business
 * phone / WhatsApp number (edited at /admin/settings; the table is
 * public-read under RLS). This helper reads those two keys and falls
 * back to the src/lib/config.ts constants whenever Supabase is not
 * configured, the read fails, or the stored value is empty — so the
 * site never renders a blank where a number used to be.
 *
 * Used by exactly two surfaces: the site footer and the contact page.
 *
 * getPricingTerms() below applies the same pattern to the two money
 * keys (minimum_order_paise, free_delivery_threshold_paise) that feed
 * the order totals engine.
 */
export interface BusinessSettings {
  phone: string;
  whatsapp: string;
  hasPhone: boolean;
  hasWhatsapp: boolean;
  /** True when the values came from the settings table. */
  fromDatabase: boolean;
}

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const fallback: BusinessSettings = {
    phone: configSettings.phone,
    whatsapp: configSettings.whatsapp,
    hasPhone: configSettings.phone.trim().length > 0,
    hasWhatsapp: configSettings.whatsapp.trim().length > 0,
    fromDatabase: false,
  };

  const supabase = await createClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["business_phone", "business_whatsapp"]);
  if (error || !data) return fallback;

  const byKey = new Map(
    (data as { key: string; value: string | null }[]).map((r) => [r.key, r.value]),
  );
  const phone = byKey.get("business_phone")?.trim() || fallback.phone;
  const whatsapp = byKey.get("business_whatsapp")?.trim() || fallback.whatsapp;
  const fromDatabase = Boolean(
    byKey.get("business_phone")?.trim() || byKey.get("business_whatsapp")?.trim(),
  );

  return {
    phone,
    whatsapp,
    hasPhone: phone.trim().length > 0,
    hasWhatsapp: whatsapp.trim().length > 0,
    fromDatabase,
  };
}

/**
 * Pricing terms (minimum order / free-delivery threshold) — the values
 * the totals engine must actually charge by. Reads the two paise keys
 * from the same `settings` table and resolves them through
 * resolvePricingTerms() (src/lib/pricing.ts): each key falls back
 * independently to the approved pricing.ts constants whenever Supabase
 * is not configured, the read fails, or the stored value is missing or
 * invalid — so an admin settings edit takes effect at checkout, and a
 * settings problem can never break checkout.
 *
 * Used by POST /api/orders (server recalculation) and the /order page
 * (so the customer's live preview is computed with the same terms the
 * server will re-check against).
 */
export async function getPricingTerms(): Promise<ResolvedPricingTerms> {
  const fallback: ResolvedPricingTerms = {
    ...defaultPricingTermsPaise,
    fromDatabase: false,
  };

  const supabase = await createClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["minimum_order_paise", "free_delivery_threshold_paise"]);
  if (error || !data) return fallback;

  return resolvePricingTerms(
    data as { key: string; value: string | null }[],
  );
}
