"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { statusLabel } from "@/lib/order-flow";
import {
  collectionsByMethod,
  expectedCashPaise,
  isInIstDay,
  istToday,
} from "@/lib/finance";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import { listDemoOrders } from "@/lib/demo-store";
import {
  demoOrderFinance,
  listDemoExpenses,
  listDemoPaymentEntries,
  listDemoRefunds,
} from "@/lib/demo-finance";

/**
 * Admin dashboard (admin redesign) — the /admin landing page.
 *
 * Four stat tiles and three panels, every number computed from the
 * same sources the rest of the panel uses: live mode reads
 * GET /api/admin/orders, /api/admin/finance/overview,
 * /api/admin/finance/outstanding and /api/admin/refunds; demo mode
 * computes the identical views from this browser's demo stores (the
 * layout banner makes clear which world you are in). Nothing here is
 * a placeholder: empty days say so honestly.
 */

interface RecentOrder {
  id: string;
  customer: string;
  totalPaise: number;
  status: string;
}

interface AttentionRefund {
  id: string;
  orderId: string;
  customer: string;
  amountPaise: number;
  status: string;
}

interface DashData {
  ordersToday: number;
  collectedTodayPaise: number;
  inProgress: number;
  outstandingPaise: number;
  outstandingCount: number;
  recent: RecentOrder[];
  refunds: AttentionRefund[];
  stalePickups: number;
  expectedCashPaise: number;
  gatewayPaise: number;
  deskPaise: number;
  refundsProcessedPaise: number;
  expensesTodayPaise: number;
}

interface LiveOrderRow {
  id: string;
  status: string;
  total_paise: number;
  created_at: string;
  profiles:
    | { name: string | null; phone: string | null }
    | { name: string | null; phone: string | null }[]
    | null;
}

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function TileIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-admin-accent/10 text-admin-accent">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        {children}
      </svg>
    </span>
  );
}

function Panel({
  title,
  linkHref,
  linkLabel,
  children,
}: {
  title: string;
  linkHref?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-admin-border bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-admin-border pb-3">
        <h2 className="text-[15px] font-bold tracking-tight text-admin-heading">{title}</h2>
        {linkHref && linkLabel && (
          <Link
            href={linkHref}
            className="shrink-0 text-[13px] font-bold text-brand-700 hover:underline"
          >
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
      {statusLabel(status)}
    </span>
  );
}

export default function AdminDashboard({ mode }: { mode: "live" | "demo" }) {
  const [data, setData] = useState<DashData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDemo = useCallback((): DashData => {
    const today = istToday();
    const orders = listDemoOrders();
    const entries = listDemoPaymentEntries().filter((e) => isInIstDay(e.createdAt, today));
    const collections = collectionsByMethod([], entries);
    const collected = collections.reduce((s, c) => s + c.totalPaise, 0);

    const outstandingRows = orders
      .filter((o) => o.status !== "CANCELLED")
      .map((o) => ({ order: o, finance: demoOrderFinance(o) }))
      .filter((r) => r.finance.outstandingPaise > 0);
    const nameById = new Map(orders.map((o) => [o.id, o.name]));

    return {
      ordersToday: orders.filter((o) => isInIstDay(o.createdAt, today)).length,
      collectedTodayPaise: collected,
      inProgress: orders.filter(
        (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED",
      ).length,
      outstandingPaise: outstandingRows.reduce((s, r) => s + r.finance.outstandingPaise, 0),
      outstandingCount: outstandingRows.length,
      recent: [...orders]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6)
        .map((o) => ({ id: o.id, customer: o.name, totalPaise: o.totalPaise, status: o.status })),
      refunds: listDemoRefunds()
        .filter((r) => r.status === "requested" || r.status === "approved")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          orderId: r.orderId,
          customer: nameById.get(r.orderId) ?? "Customer",
          amountPaise: r.amountPaise,
          status: r.status,
        })),
      stalePickups: orders.filter(
        (o) => o.status === "PICKUP_SCHEDULED" && !isInIstDay(o.createdAt, today),
      ).length,
      expectedCashPaise: expectedCashPaise(entries),
      gatewayPaise: 0,
      deskPaise: collected,
      refundsProcessedPaise: entries
        .filter((e) => e.entryType === "refund")
        .reduce((s, e) => s + e.amountPaise, 0),
      expensesTodayPaise: listDemoExpenses()
        .filter((e) => e.expenseDate === today)
        .reduce((s, e) => s + e.amountPaise, 0),
    };
  }, []);

  const loadLive = useCallback(async (): Promise<DashData> => {
    const [ordersRes, overviewRes, outstandingRes, refundsRes] = await Promise.all([
      fetch("/api/admin/orders"),
      fetch("/api/admin/finance/overview"),
      fetch("/api/admin/finance/outstanding"),
      fetch("/api/admin/refunds"),
    ]);
    const [ordersJson, overviewJson, outstandingJson, refundsJson] = await Promise.all([
      ordersRes.json().catch(() => null),
      overviewRes.json().catch(() => null),
      outstandingRes.json().catch(() => null),
      refundsRes.json().catch(() => null),
    ]);
    if (!ordersRes.ok || ordersJson?.mode !== "live") {
      throw new Error(ordersJson?.error ?? "Could not load the dashboard data.");
    }
    const today = istToday();
    const orders = (ordersJson.orders ?? []) as LiveOrderRow[];
    const collections = (overviewJson?.collections ?? []) as {
      gatewayPaise: number;
      entriesPaise: number;
    }[];

    return {
      ordersToday: orders.filter((o) => isInIstDay(o.created_at, today)).length,
      collectedTodayPaise: (overviewJson?.totalCollectedPaise ?? 0) as number,
      inProgress: orders.filter(
        (o) => o.status !== "DELIVERED" && o.status !== "CANCELLED",
      ).length,
      outstandingPaise: (outstandingJson?.totalOutstandingPaise ?? 0) as number,
      outstandingCount: (outstandingJson?.count ?? 0) as number,
      recent: orders.slice(0, 6).map((o) => ({
        id: o.id,
        customer: first(o.profiles)?.name ?? "Customer",
        totalPaise: o.total_paise,
        status: o.status,
      })),
      refunds: ((refundsJson?.refunds ?? []) as {
        id: string;
        orderId: string;
        customer: string;
        amountPaise: number;
        status: string;
      }[])
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          orderId: r.orderId,
          customer: r.customer,
          amountPaise: r.amountPaise,
          status: r.status,
        })),
      stalePickups: orders.filter(
        (o) => o.status === "PICKUP_SCHEDULED" && !isInIstDay(o.created_at, today),
      ).length,
      expectedCashPaise: (overviewJson?.expectedCashPaise ?? 0) as number,
      gatewayPaise: collections.reduce((s, c) => s + c.gatewayPaise, 0),
      deskPaise: collections.reduce((s, c) => s + c.entriesPaise, 0),
      refundsProcessedPaise: (overviewJson?.refundsProcessedPaise ?? 0) as number,
      expensesTodayPaise: (overviewJson?.expensesTotalPaise ?? 0) as number,
    };
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(mode === "demo" ? loadDemo() : await loadLive());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the dashboard data.");
    }
  }, [mode, loadDemo, loadLive]);

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

  if (!data) {
    return (
      <div aria-label="Loading dashboard">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-admin-border bg-white p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-9 w-28" />
              <Skeleton className="mt-3 h-3.5 w-32" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-admin-border bg-white p-5 lg:col-span-3">
            <SkeletonText lines={5} />
          </div>
          <div className="rounded-xl border border-admin-border bg-white p-5 lg:col-span-2">
            <SkeletonText lines={5} />
          </div>
        </div>
      </div>
    );
  }

  const tiles = [
    {
      label: "Orders today",
      value: String(data.ordersToday),
      sub: data.ordersToday === 0 ? "No orders yet today" : "Placed since midnight (IST)",
      icon: (
        <TileIcon>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.6} />
        </TileIcon>
      ),
    },
    {
      label: "Collected today",
      value: formatPaise(data.collectedTodayPaise),
      sub: "Gateway + desk collections",
      icon: (
        <TileIcon>
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.6" />
        </TileIcon>
      ),
    },
    {
      label: "In progress",
      value: String(data.inProgress),
      sub: "Orders not yet delivered",
      icon: (
        <TileIcon>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 3.8v4h-4" />
        </TileIcon>
      ),
    },
    {
      label: "Outstanding",
      value: formatPaise(data.outstandingPaise),
      sub:
        data.outstandingCount === 0
          ? "Nothing owed right now"
          : `${data.outstandingCount} order${data.outstandingCount === 1 ? "" : "s"} with a balance`,
      icon: (
        <TileIcon>
          <rect x="3" y="5.5" width="18" height="13" rx="2" />
          <path d="M3 10h18" />
          <path d="M6.5 15h4" />
        </TileIcon>
      ),
    },
  ];

  return (
    <div>
      {/* Stat tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-admin-border bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-admin-muted">
                {tile.label}
              </p>
              {tile.icon}
            </div>
            <p className="mt-1 text-[32px] font-extrabold leading-none tracking-tight text-admin-heading">
              {tile.value}
            </p>
            <p className="mt-2.5 text-[13px] text-admin-muted">{tile.sub}</p>
          </div>
        ))}
      </div>

      {/* Panels */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title="Recent orders" linkHref="/admin/orders" linkLabel="Open the queue →">
            {data.recent.length === 0 ? (
              <p className="text-sm text-admin-muted">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-admin-border">
                {data.recent.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 hover:bg-admin-panel/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink-900">
                          {order.customer}
                        </span>
                        <span className="block text-xs text-admin-muted">
                          #{order.id.slice(0, 8)}
                        </span>
                      </span>
                      <span className="text-sm font-bold text-ink-900">
                        {formatPaise(order.totalPaise)}
                      </span>
                      <StatusChip status={order.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="grid gap-4 lg:col-span-2">
          <Panel title="Needs attention" linkHref="/admin/finance" linkLabel="Finance →">
            {data.refunds.length === 0 && data.stalePickups === 0 ? (
              <p className="text-sm text-admin-muted">
                Nothing is waiting on a decision right now.
              </p>
            ) : (
              <>
                {data.refunds.length > 0 && (
                  <ul className="divide-y divide-admin-border">
                    {data.refunds.map((refund) => (
                      <li
                        key={refund.id}
                        className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-ink-900">
                            Refund — {refund.customer}
                          </span>
                          <span className="block text-xs capitalize text-admin-muted">
                            {refund.status} · order #{refund.orderId.slice(0, 8)}
                          </span>
                        </span>
                        <span className="text-sm font-bold text-ink-900">
                          {formatPaise(refund.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {data.stalePickups > 0 && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] font-semibold text-amber-900">
                    {data.stalePickups} pickup{data.stalePickups === 1 ? "" : "s"} scheduled
                    before today still waiting — see the{" "}
                    <Link href="/admin/orders" className="underline">
                      order queue
                    </Link>
                    .
                  </p>
                )}
              </>
            )}
          </Panel>

          <Panel title="Today at the desk">
            <dl className="grid gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-admin-muted">Expected cash in drawer</dt>
                <dd className="font-extrabold text-admin-heading">
                  {formatPaise(data.expectedCashPaise)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-admin-muted">Collected online (gateway)</dt>
                <dd className="font-bold text-ink-900">{formatPaise(data.gatewayPaise)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-admin-muted">Collected at the desk</dt>
                <dd className="font-bold text-ink-900">{formatPaise(data.deskPaise)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-admin-border pt-3">
                <dt className="text-admin-muted">Refunds processed today</dt>
                <dd className="font-bold text-ink-900">
                  {formatPaise(data.refundsProcessedPaise)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-admin-muted">Expenses today</dt>
                <dd className="font-bold text-ink-900">
                  {formatPaise(data.expensesTodayPaise)}
                </dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
