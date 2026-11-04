"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPaise } from "@/lib/pricing";
import {
  listDemoPricing,
  saveDemoPricing,
  type DemoPricingGroup,
} from "@/lib/demo-org";

/**
 * Pricing editor (Phase 7b).
 *
 * Every row is one price_items record: price, express multiplier and
 * the active flag. Saving PATCHes /api/admin/pricing/[id] (admin-gated,
 * audit-logged) and takes effect immediately — the storefront and
 * checkout read the catalogue DB-first, so there is no second copy of
 * the price list to drift. Demo mode edits this browser's demo store
 * only (seeded from the approved static list).
 */

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";

interface ItemView {
  id: string;
  itemName: string;
  priceInr: number;
  unitLabel: string;
  expressMultiplier: number;
  active: boolean;
}

interface GroupView {
  key: string;
  title: string;
  unitNote: string;
  items: ItemView[];
}

interface RowDraft {
  priceInr: string;
  expressMultiplier: string;
  active: boolean;
}

export default function AdminPricing({ mode }: { mode: "live" | "demo" }) {
  const [groups, setGroups] = useState<GroupView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const applyGroups = useCallback((next: GroupView[]) => {
    setGroups(next);
    const d: Record<string, RowDraft> = {};
    for (const g of next) {
      for (const item of g.items) {
        d[item.id] = {
          priceInr: String(item.priceInr),
          expressMultiplier: String(item.expressMultiplier),
          active: item.active,
        };
      }
    }
    setDrafts(d);
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pricing");
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.mode !== "live") {
        setLoadError(json?.error ?? "Could not load pricing.");
        return;
      }
      const view: GroupView[] = (json.groups as {
        serviceId: string;
        slug: string;
        title: string;
        items: {
          id: string;
          name: string;
          pricePaise: number;
          unitLabel: string;
          expressMultiplier: number;
          active: boolean;
        }[];
      }[]).map((g) => ({
        key: g.serviceId,
        title: g.title,
        unitNote: "",
        items: g.items.map((i) => ({
          id: i.id,
          itemName: i.name,
          priceInr: i.pricePaise / 100,
          unitLabel: i.unitLabel,
          expressMultiplier: i.expressMultiplier,
          active: i.active,
        })),
      }));
      applyGroups(view);
    } catch {
      setLoadError("Could not load pricing.");
    } finally {
      setLoading(false);
    }
  }, [applyGroups]);

  const loadDemo = useCallback(() => {
    const demo = listDemoPricing();
    applyGroups(
      demo.map((g: DemoPricingGroup) => ({
        key: g.serviceSlug,
        title: g.title,
        unitNote: g.unitNote,
        items: g.items.map((i) => ({
          id: i.id,
          itemName: i.itemName,
          priceInr: i.priceInr,
          unitLabel: i.unitLabel,
          expressMultiplier: i.expressMultiplier,
          active: i.active,
        })),
      })),
    );
    setLoading(false);
  }, [applyGroups]);

  useEffect(() => {
    if (mode === "live") void loadLive();
    else loadDemo();
  }, [mode, loadLive, loadDemo]);

  function isDirty(item: ItemView): boolean {
    const d = drafts[item.id];
    if (!d) return false;
    return (
      d.priceInr !== String(item.priceInr) ||
      d.expressMultiplier !== String(item.expressMultiplier) ||
      d.active !== item.active
    );
  }

  async function saveRow(item: ItemView) {
    const draft = drafts[item.id];
    if (!draft) return;
    const price = Number(draft.priceInr);
    const multiplier = Number(draft.expressMultiplier);
    if (!Number.isFinite(price) || price < 0) {
      setRowError((r) => ({ ...r, [item.id]: "Enter a valid price (₹0 or more)." }));
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5) {
      setRowError((r) => ({ ...r, [item.id]: "Express multiplier must be between 1 and 5." }));
      return;
    }
    setSavingId(item.id);
    setRowError((r) => ({ ...r, [item.id]: "" }));
    setFeedback(null);
    try {
      if (mode === "demo") {
        const demo = listDemoPricing();
        const next = demo.map((g) => ({
          ...g,
          items: g.items.map((i) =>
            i.id === item.id
              ? { ...i, priceInr: price, expressMultiplier: multiplier, active: draft.active }
              : i,
          ),
        }));
        saveDemoPricing(next);
        loadDemo();
        setFeedback(`${item.itemName} updated (demo — this browser only).`);
        return;
      }
      const res = await fetch(`/api/admin/pricing/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pricePaise: Math.round(price * 100),
          expressMultiplier: multiplier,
          active: draft.active,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRowError((r) => ({ ...r, [item.id]: json?.error ?? "Could not save." }));
        return;
      }
      setFeedback(
        `${item.itemName} is now ${formatPaise(json.item.pricePaise)} ${json.item.unitLabel} — live on the pricing page and at checkout.`,
      );
      await loadLive();
    } catch {
      setRowError((r) => ({ ...r, [item.id]: "Could not save. Please try again." }));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="mt-8 text-sm text-ink-500">Loading pricing…</p>;
  if (loadError) {
    return (
      <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {loadError}
      </p>
    );
  }

  return (
    <div className="mt-8">
      {feedback && (
        <p role="status" className="mb-6 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
          {feedback}
        </p>
      )}
      <div className="grid gap-10">
        {groups.map((group) => (
          <section key={group.key}>
            <h2 className="text-lg font-extrabold tracking-tight text-ink-900">{group.title}</h2>
            {group.unitNote && <p className="mt-0.5 text-sm text-ink-500">{group.unitNote}</p>}
            <ul className="mt-3 divide-y divide-brand-50 rounded-2xl border border-brand-100">
              {group.items.map((item) => {
                const draft = drafts[item.id];
                if (!draft) return null;
                const dirty = isDirty(item);
                return (
                  <li
                    key={item.id}
                    className={`grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end ${item.active ? "" : "opacity-60"}`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{item.itemName}</p>
                      <p className="text-xs text-ink-500">
                        Currently {formatPaise(Math.round(item.priceInr * 100))} {item.unitLabel} · express {item.expressMultiplier}×
                      </p>
                      {rowError[item.id] && (
                        <p role="alert" className="mt-1 text-sm font-semibold text-red-600">{rowError[item.id]}</p>
                      )}
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-ink-700">
                      Price (₹)
                      <input
                        type="number" min={0} step="0.01" inputMode="decimal"
                        value={draft.priceInr}
                        onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { ...draft, priceInr: e.target.value } }))}
                        className={`${inputClass} sm:w-28`}
                        aria-label={`Price for ${item.itemName} in rupees`}
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-ink-700">
                      Express ×
                      <input
                        type="number" min={1} max={5} step="0.05" inputMode="decimal"
                        value={draft.expressMultiplier}
                        onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { ...draft, expressMultiplier: e.target.value } }))}
                        className={`${inputClass} sm:w-24`}
                        aria-label={`Express multiplier for ${item.itemName}`}
                      />
                    </label>
                    <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-ink-700">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { ...draft, active: e.target.checked } }))}
                        className="h-5 w-5 accent-brand-600"
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      disabled={!dirty || savingId === item.id}
                      onClick={() => void saveRow(item)}
                      className="min-h-[44px] rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {savingId === item.id ? "Saving…" : "Save"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
