"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  buildNotifications,
  notificationCounts,
  type AdminNotification,
} from "@/lib/notifications";
import { isInIstDay, istToday } from "@/lib/finance";
import { Skeleton } from "@/components/Skeleton";
import { listDemoOrders, listDemoPickups } from "@/lib/demo-store";
import {
  listDemoClosings,
  listDemoPaymentEntries,
  listDemoRefunds,
} from "@/lib/demo-finance";
import { listDemoVouchers } from "@/lib/demo-org";

/**
 * Admin notifications view (Delta 1) — derived, never stored.
 * Live mode reads GET /api/admin/notifications; demo mode runs the
 * SAME derivation (src/lib/notifications.ts) over this browser's
 * demo stores. Fixing the underlying thing (approving the refund,
 * moving the order, closing the day) removes the item on the next
 * load — there is nothing to dismiss because nothing is persisted.
 */

const SEVERITY_STYLES: Record<
  AdminNotification["severity"],
  { chip: string; label: string }
> = {
  high: { chip: "bg-red-50 text-red-700", label: "High" },
  medium: { chip: "bg-amber-50 text-amber-800", label: "Medium" },
  low: { chip: "bg-admin-panel text-admin-muted", label: "Low" },
};

export default function AdminNotifications({
  mode,
}: {
  mode: "live" | "demo";
}) {
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      if (mode === "demo") {
        const now = new Date();
        const yesterday = istToday(new Date(now.getTime() - 86_400_000));
        const entriesYesterday = listDemoPaymentEntries().filter((e) =>
          isInIstDay(e.createdAt, yesterday),
        );
        setItems(
          buildNotifications(
            {
              refunds: listDemoRefunds().map((r) => ({
                id: r.id,
                orderId: r.orderId,
                amountPaise: r.amountPaise,
                status: r.status,
                createdAt: r.createdAt,
                decidedAt: r.decidedAt,
              })),
              orders: listDemoOrders().map((o) => ({
                id: o.id,
                status: o.status,
                paymentStatus: o.paymentStatus,
                createdAt: o.createdAt,
                customerLabel: o.name,
              })),
              guestPickups: listDemoPickups().map((p) => ({
                id: p.ref,
                name: p.name,
                phone: p.phone,
                createdAt: p.createdAt,
              })),
              vouchers: listDemoVouchers().map((v) => ({
                id: v.id,
                code: v.code,
                kind: v.kind,
                status: v.status,
                validUntil: v.validUntil,
                balancePaise: v.balancePaise,
              })),
              yesterday: {
                date: yesterday,
                hasCashActivity: entriesYesterday.some((e) => e.method === "cash"),
                hasClosing: listDemoClosings().some((c) => c.date === yesterday),
              },
              now,
            },
            now,
          ),
        );
        return;
      }
      const res = await fetch("/api/admin/notifications");
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.mode !== "live") {
        throw new Error(json?.error ?? "Could not load notifications.");
      }
      setItems(json.items ?? []);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load notifications.",
      );
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-bold text-red-800">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="btn-press mt-3 inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (items === null) {
    return (
      <div aria-label="Loading notifications" className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full" />
        ))}
      </div>
    );
  }

  const counts = notificationCounts(items);

  return (
    <div>
      <p className="mb-4 text-sm text-admin-muted">
        {items.length === 0
          ? "All clear — nothing needs attention right now."
          : `${counts.total} open item${counts.total === 1 ? "" : "s"} · ${counts.high} high · ${counts.medium} medium · ${counts.low} low. Items clear themselves when the underlying work is done.`}
      </p>
      <ul className="grid gap-3">
        {items.map((item) => {
          const sev = SEVERITY_STYLES[item.severity];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-admin-border bg-white px-5 py-4 hover:bg-admin-panel/60"
              >
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sev.chip}`}
                >
                  {sev.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink-900">
                    {item.title}
                  </span>
                  <span className="block text-[13px] text-admin-muted">
                    {item.detail}
                  </span>
                </span>
                <span className="text-[13px] font-bold text-brand-700">
                  Open →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
