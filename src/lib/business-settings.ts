import { createClient } from "@/lib/supabase/server";
import { businessSettings as configSettings } from "@/lib/config";

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
