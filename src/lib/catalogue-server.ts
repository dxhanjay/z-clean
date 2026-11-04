import { createClient } from "@/lib/supabase/server";
import {
  allPriceItems,
  priceGroups,
  type PriceGroup,
  type PriceItem,
} from "@/lib/pricing";
import type { CatalogueEntry } from "@/lib/totals";

/**
 * Storefront catalogue (Phase 7b) — SERVER ONLY.
 *
 * POST /api/orders has always re-priced from the DATABASE in live mode
 * (loadCatalogue in src/lib/orders-server.ts). The storefront pages,
 * however, rendered the static mirror in src/lib/pricing.ts — so an
 * admin price edit would have changed checkout totals while the pricing
 * page kept showing the old price (and the order page's preview would
 * have failed the server's total check). This loader closes that gap:
 *
 *   - Supabase configured → services + price_items are the truth. The
 *     static groups provide only presentation (group titles, unit
 *     notes, item order, per-item unit labels and notes); every price,
 *     the active set and the express multipliers come from the DB.
 *   - Unconfigured / DB error / empty DB → the approved static list,
 *     exactly as before (demo mode is unchanged).
 *
 * Grouping rule: items join the static group of their service when one
 * exists; DB-only services get their own group (service name as title).
 * Items that exist in the static list but are inactive/absent in the DB
 * disappear in live mode — the DB is the truth.
 */

export interface StorefrontCatalogue {
  groups: PriceGroup[];
  /** Flat catalogue for the totals engine (DB express multipliers). */
  entries: CatalogueEntry[];
  fromDatabase: boolean;
}

export const UNIT_LABELS: Record<string, string> = {
  kg: "per kg",
  piece: "per piece",
  pair: "per pair",
  sqft: "per sq ft",
};

function staticResult(): StorefrontCatalogue {
  return {
    groups: priceGroups,
    entries: allPriceItems.map((p) => ({
      serviceSlug: p.serviceSlug,
      itemName: p.itemName,
      pricePaise: Math.round(p.priceInr * 100),
      unitLabel: p.unitLabel,
      expressMultiplier: 1.5,
    })),
    fromDatabase: false,
  };
}

interface DbService {
  id: string;
  slug: string;
  name: string;
  pricing_unit: string;
}

interface DbPriceItem {
  id: string;
  service_id: string;
  item_name: string;
  price_paise: number;
  express_multiplier: number;
}

export async function loadStorefrontCatalogue(): Promise<StorefrontCatalogue> {
  const supabase = await createClient();
  if (!supabase) return staticResult();

  const [svcRes, itemRes] = await Promise.all([
    supabase.from("services").select("id, slug, name, pricing_unit").eq("active", true),
    supabase
      .from("price_items")
      .select("id, service_id, item_name, price_paise, express_multiplier")
      .eq("active", true),
  ]);
  if (svcRes.error || itemRes.error || !svcRes.data || !itemRes.data) {
    return staticResult();
  }
  const services = svcRes.data as DbService[];
  const items = itemRes.data as DbPriceItem[];
  if (services.length === 0 || items.length === 0) return staticResult();

  const serviceById = new Map(services.map((s) => [s.id, s]));
  const localByKey = new Map(
    allPriceItems.map((p) => [`${p.serviceSlug}::${p.itemName}`, p]),
  );

  const entries: CatalogueEntry[] = [];
  const dbItemsByService = new Map<string, PriceItem[]>();
  for (const row of items) {
    const svc = serviceById.get(row.service_id);
    if (!svc) continue;
    const local = localByKey.get(`${svc.slug}::${row.item_name}`);
    const unitLabel = local?.unitLabel ?? UNIT_LABELS[svc.pricing_unit] ?? "per piece";
    entries.push({
      serviceSlug: svc.slug,
      itemName: row.item_name,
      pricePaise: row.price_paise,
      unitLabel,
      expressMultiplier: Number(row.express_multiplier) || 1.5,
    });
    const list = dbItemsByService.get(svc.slug) ?? [];
    list.push({
      serviceSlug: svc.slug,
      itemName: row.item_name,
      priceInr: row.price_paise / 100,
      unitLabel,
      note: local?.note,
    });
    dbItemsByService.set(svc.slug, list);
  }
  if (entries.length === 0) return staticResult();

  // Presentation: static group order/titles first, items re-ordered to
  // the static list's order inside each group; DB-only services appended.
  const groups: PriceGroup[] = [];
  const usedSlugs = new Set<string>();
  for (const g of priceGroups) {
    const groupSlugs = new Set<string>([
      g.serviceSlug,
      ...g.items.map((i) => i.serviceSlug),
    ]);
    const groupItems: PriceItem[] = [];
    for (const slug of groupSlugs) {
      const dbItems = dbItemsByService.get(slug);
      if (!dbItems) continue;
      usedSlugs.add(slug);
      const staticOrder = new Map(
        allPriceItems
          .filter((p) => p.serviceSlug === slug)
          .map((p, idx) => [p.itemName, idx]),
      );
      groupItems.push(
        ...[...dbItems].sort(
          (a, b) =>
            (staticOrder.get(a.itemName) ?? 999) - (staticOrder.get(b.itemName) ?? 999),
        ),
      );
    }
    if (groupItems.length > 0) {
      groups.push({ title: g.title, serviceSlug: g.serviceSlug, unitNote: g.unitNote, items: groupItems });
    }
  }
  for (const svc of services) {
    if (usedSlugs.has(svc.slug)) continue;
    const dbItems = dbItemsByService.get(svc.slug);
    if (!dbItems || dbItems.length === 0) continue;
    const unitLabel = UNIT_LABELS[svc.pricing_unit] ?? "per piece";
    groups.push({
      title: svc.name,
      serviceSlug: svc.slug,
      unitNote: `Charged ${unitLabel}`,
      items: dbItems,
    });
  }

  return { groups, entries, fromDatabase: true };
}
