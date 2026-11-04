import { supabase } from "./supabase";

/**
 * Service areas (Mobile Phase 1).
 *
 * The live list lives in the `service_areas` table (the admin owns
 * it); the app reads it through the Supabase client under the same
 * public-read RLS the web relies on. The 13 Bokaro Steel City areas
 * below are the bundled fallback — the same mirror the web keeps in
 * src/lib/pricing.ts — used only when the database read fails.
 */

export interface ServiceArea {
  area: string;
  city: string;
  pincode: string;
}

export const FALLBACK_AREAS: ServiceArea[] = [
  { area: "Sector 1", city: "Bokaro Steel City", pincode: "827001" },
  { area: "Sector 2", city: "Bokaro Steel City", pincode: "827001" },
  { area: "Sector 3", city: "Bokaro Steel City", pincode: "827003" },
  { area: "Sector 4 / City Centre", city: "Bokaro Steel City", pincode: "827004" },
  { area: "Sector 6", city: "Bokaro Steel City", pincode: "827006" },
  { area: "Sector 8", city: "Bokaro Steel City", pincode: "827009" },
  { area: "Sector 9", city: "Bokaro Steel City", pincode: "827009" },
  { area: "Chas", city: "Bokaro Steel City", pincode: "827013" },
  { area: "Balidih", city: "Bokaro Steel City", pincode: "827010" },
  { area: "Balidih Industrial Area", city: "Bokaro Steel City", pincode: "827010" },
  { area: "Bokaro Station (Marafari)", city: "Bokaro Steel City", pincode: "827010" },
  { area: "Tanr Balidih", city: "Bokaro Steel City", pincode: "827014" },
  { area: "Jaina More", city: "Bokaro Steel City", pincode: "829301" },
];

async function fetchServiceAreas(): Promise<ServiceArea[]> {
  try {
    const { data, error } = await supabase
      .from("service_areas")
      .select("area, city, pincode")
      .eq("active", true)
      .order("area", { ascending: true });
    if (error || !data || data.length === 0) return FALLBACK_AREAS;
    return data
      .filter((r) => r.pincode)
      .map((r) => ({ area: r.area as string, city: r.city as string, pincode: r.pincode as string }));
  } catch {
    return FALLBACK_AREAS;
  }
}

/* ---------------- Tiny SWR cache (polish) ----------------
 * Areas ARE fetched async (Supabase, above — only the fallback is a
 * static bundled list), so the same 60s cache as the catalogue
 * applies: fresh → cached; stale but present → stale immediately
 * plus one background refresh; absent → fetch. Signature unchanged. */
const AREAS_TTL_MS = 60_000;
let areasCache: { data: ServiceArea[]; at: number } | null = null;
let areasRefresh: Promise<void> | null = null;

function refreshAreasInBackground(): void {
  if (areasRefresh) return;
  areasRefresh = fetchServiceAreas()
    .then((data) => {
      areasCache = { data, at: Date.now() };
    })
    .catch(() => {
      // Keep the stale copy; the next stale read retries.
    })
    .finally(() => {
      areasRefresh = null;
    });
}

export async function loadServiceAreas(): Promise<ServiceArea[]> {
  if (areasCache) {
    if (Date.now() - areasCache.at < AREAS_TTL_MS) return areasCache.data;
    refreshAreasInBackground();
    return areasCache.data;
  }
  const data = await fetchServiceAreas();
  areasCache = { data, at: Date.now() };
  return data;
}
