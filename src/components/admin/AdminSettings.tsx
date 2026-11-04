"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import {
  listDemoSettings,
  saveDemoSettings,
  type DemoSetting,
} from "@/lib/demo-org";

/**
 * Business Settings editor (Phase 7b).
 *
 * Edits the seeded settings table — the same rows the site reads. The
 * footer and contact page take phone / WhatsApp from these values via
 * getBusinessSettings(), so saving here changes the site immediately.
 * Money-valued keys are stored in paise and edited in rupees. The API
 * refuses unknown keys, so this screen can never invent configuration
 * nothing reads. Demo mode edits this browser's demo store only.
 */

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";

interface SettingMeta {
  label: string;
  help: string;
  /** Stored in paise; edited as rupees. */
  paise?: boolean;
  multiline?: boolean;
}

const META: Record<string, SettingMeta> = {
  business_phone: {
    label: "Business phone",
    help: "Shown in the site footer and on the contact page. (The current number is the DEMO placeholder — replace it with the real business number before launch.)",
  },
  business_whatsapp: {
    label: "WhatsApp number",
    help: "WhatsApp contact for the business, in the same format as the phone number.",
  },
  business_email: {
    label: "Business email",
    help: "Public contact email for the business.",
  },
  business_address: {
    label: "Business address",
    help: "The plant / shop address shown to customers.",
    multiline: true,
  },
  opening_hours: {
    label: "Opening hours",
    help: "Shown to customers, e.g. “Mon–Sun, 9 AM – 9 PM”.",
  },
  free_delivery_threshold_paise: {
    label: "Free delivery threshold (₹)",
    help: "Orders at or above this amount get free pickup & delivery. Stored in paise in the settings table.",
    paise: true,
  },
  minimum_order_paise: {
    label: "Minimum order (₹)",
    help: "The smallest order value accepted. Stored in paise in the settings table.",
    paise: true,
  },
  first_order_offer_note: {
    label: "First-order offer note",
    help: "Short line describing the current first-order offer.",
    multiline: true,
  },
};

interface SettingView {
  key: string;
  /** Raw stored value (paise string for money keys). */
  value: string;
  /** What the input shows (rupees for money keys). */
  draft: string;
}

function toView(row: { key: string; value: string | null }): SettingView {
  const raw = row.value ?? "";
  const meta = META[row.key];
  return {
    key: row.key,
    value: raw,
    draft: meta?.paise && raw !== "" ? String(Number(raw) / 100) : raw,
  };
}

function draftToRaw(key: string, draft: string): string | null {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (META[key]?.paise) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? String(Math.round(n * 100)) : trimmed;
  }
  return trimmed;
}

export default function AdminSettings({ mode }: { mode: "live" | "demo" }) {
  const [settings, setSettings] = useState<SettingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.mode !== "live") {
        setLoadError(json?.error ?? "Could not load settings.");
        return;
      }
      setSettings((json.settings as { key: string; value: string | null }[]).map(toView));
    } catch {
      setLoadError("Could not load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDemo = useCallback(() => {
    setSettings(listDemoSettings().map(toView));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "live") void loadLive();
    else loadDemo();
  }, [mode, loadLive, loadDemo]);

  const changed = settings.filter((s) => draftToRaw(s.key, s.draft) !== (s.value === "" ? null : s.value));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (changed.length === 0) return;
    setBusy(true);
    setFeedback(null);
    setFormError(null);
    const values: Record<string, string | null> = {};
    for (const s of changed) values[s.key] = draftToRaw(s.key, s.draft);
    try {
      if (mode === "demo") {
        const next: DemoSetting[] = listDemoSettings().map((row) =>
          row.key in values ? { key: row.key, value: values[row.key] } : row,
        );
        saveDemoSettings(next);
        setSettings(next.map(toView));
        setFeedback("Settings saved (demo — this browser only).");
        return;
      }
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not save settings.");
        return;
      }
      setSettings((json.settings as { key: string; value: string | null }[]).map(toView));
      setFeedback("Settings saved — the footer and contact page now use the new values.");
    } catch {
      setFormError("Could not save settings. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-8 max-w-2xl" aria-label="Loading settings">
        <div className="grid gap-5">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="grid gap-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-6 h-11 w-44 rounded-full" />
      </div>
    );
  }
  if (loadError) {
    return (
      <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {loadError}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-8 max-w-2xl">
      <div className="grid gap-5">
        {settings.map((s) => {
          const meta = META[s.key];
          const label = meta?.label ?? s.key;
          return (
            <label key={s.key} className="grid gap-1.5 text-sm">
              <span className="font-semibold text-ink-900">
                {label}
                {!meta && <span className="ml-2 font-mono text-xs font-normal text-ink-500">{s.key}</span>}
              </span>
              {meta?.multiline ? (
                <textarea
                  rows={2}
                  value={s.draft}
                  onChange={(e) =>
                    setSettings((prev) => prev.map((x) => (x.key === s.key ? { ...x, draft: e.target.value } : x)))
                  }
                  className={inputClass}
                />
              ) : (
                <input
                  value={s.draft}
                  inputMode={meta?.paise ? "decimal" : undefined}
                  onChange={(e) =>
                    setSettings((prev) => prev.map((x) => (x.key === s.key ? { ...x, draft: e.target.value } : x)))
                  }
                  className={inputClass}
                />
              )}
              {meta?.help && <span className="text-xs leading-relaxed text-ink-500">{meta.help}</span>}
            </label>
          );
        })}
      </div>

      {feedback && (
        <p role="status" className="mt-5 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{feedback}</p>
      )}
      {formError && (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{formError}</p>
      )}

      <button
        type="submit"
        disabled={busy || changed.length === 0}
        className="btn-press mt-6 min-h-[44px] rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {busy ? "Saving…" : changed.length > 0 ? `Save ${changed.length} change${changed.length > 1 ? "s" : ""}` : "No changes"}
      </button>
    </form>
  );
}
