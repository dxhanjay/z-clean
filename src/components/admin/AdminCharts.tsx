"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPaise } from "@/lib/pricing";
import { statusLabel } from "@/lib/order-flow";
import {
  bucketDailySeries,
  statusBreakdown,
  type DailyPoint,
  type StatusCount,
} from "@/lib/analytics";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import { listDemoOrders } from "@/lib/demo-store";
import { listDemoPaymentEntries } from "@/lib/demo-finance";

/**
 * Dashboard charts (Delta 1) — dependency-free SVG over
 * GET /api/admin/analytics (live) or the same pure bucketing over
 * the demo stores (demo). Three views: revenue collected per day
 * (area), orders placed per day (bars), and the current status
 * breakdown (horizontal bars). Empty windows render honest zeros —
 * there is no placeholder data anywhere in this component.
 */

interface ChartsData {
  series: DailyPoint[];
  statusCounts: StatusCount[];
}

const DAY_OPTIONS = [7, 14, 30] as const;

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}/${m}`;
}

function RevenueChart({ series }: { series: DailyPoint[] }) {
  const width = 640;
  const height = 180;
  const padX = 8;
  const padTop = 10;
  const padBottom = 22;
  const max = Math.max(1, ...series.map((d) => d.revenuePaise));
  const stepX =
    series.length > 1 ? (width - padX * 2) / (series.length - 1) : 0;
  const y = (v: number) =>
    padTop + (1 - v / max) * (height - padTop - padBottom);
  const points = series.map((d, i) => [
    padX + i * stepX,
    y(d.revenuePaise),
  ] as const);
  const line = points.map((p) => p.join(",")).join(" ");
  const area =
    points.length > 0
      ? `M ${points[0][0]} ${height - padBottom} L ${points
          .map((p) => `${p[0]} ${p[1]}`)
          .join(" L ")} L ${points[points.length - 1][0]} ${height - padBottom} Z`
      : "";
  const total = series.reduce((s, d) => s + d.revenuePaise, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Revenue collected per day, total ${formatPaise(total)} over the period`}
      >
        <title>Revenue collected per day — total {formatPaise(total)}</title>
        {area && <path d={area} className="fill-brand-600/10" />}
        {points.length > 1 && (
          <polyline
            points={line}
            fill="none"
            className="stroke-brand-600"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points.map((p, i) => (
          <g key={series[i].date}>
            <circle cx={p[0]} cy={p[1]} r={2.6} className="fill-brand-600" />
            {(i % Math.ceil(series.length / 7) === 0 ||
              i === series.length - 1) && (
              <text
                x={p[0]}
                y={height - 6}
                textAnchor="middle"
                className="fill-admin-muted text-[10px]"
              >
                {shortDate(series[i].date)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="mt-1 text-[13px] text-admin-muted">
        Total collected in this window:{" "}
        <span className="font-bold text-ink-900">{formatPaise(total)}</span>{" "}
        (staff-ledger payments)
      </p>
    </div>
  );
}

function OrdersChart({ series }: { series: DailyPoint[] }) {
  const width = 640;
  const height = 180;
  const padX = 8;
  const padTop = 10;
  const padBottom = 22;
  const max = Math.max(1, ...series.map((d) => d.orders));
  const slot = (width - padX * 2) / Math.max(1, series.length);
  const barW = Math.max(2, slot * 0.62);
  const total = series.reduce((s, d) => s + d.orders, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Orders placed per day, ${total} in total over the period`}
      >
        <title>Orders placed per day — {total} total</title>
        {series.map((d, i) => {
          const h = (d.orders / max) * (height - padTop - padBottom);
          const x = padX + i * slot + (slot - barW) / 2;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={height - padBottom - h}
                width={barW}
                height={h}
                rx={2}
                className="fill-admin-accent"
              />
              {(i % Math.ceil(series.length / 7) === 0 ||
                i === series.length - 1) && (
                <text
                  x={padX + i * slot + slot / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-admin-muted text-[10px]"
                >
                  {shortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[13px] text-admin-muted">
        <span className="font-bold text-ink-900">{total}</span> orders placed
        in this window
      </p>
    </div>
  );
}

function StatusBars({ counts }: { counts: StatusCount[] }) {
  const visible = counts.filter((c) => c.count > 0);
  const max = Math.max(1, ...counts.map((c) => c.count));
  if (visible.length === 0) {
    return <p className="text-sm text-admin-muted">No orders yet.</p>;
  }
  return (
    <ul className="grid gap-2.5">
      {counts.map((c) => (
        <li key={c.status} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-[13px] font-semibold text-ink-900">
            {statusLabel(c.status)}
          </span>
          <span className="h-3.5 flex-1 overflow-hidden rounded-full bg-admin-panel">
            <span
              className="block h-full rounded-full bg-brand-600"
              style={{ width: `${(c.count / max) * 100}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-[13px] font-bold text-ink-900">
            {c.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminCharts({ mode }: { mode: "live" | "demo" }) {
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<ChartsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      if (mode === "demo") {
        const orders = listDemoOrders();
        setData({
          series: bucketDailySeries(
            {
              orders: orders.map((o) => ({ createdAt: o.createdAt })),
              revenue: listDemoPaymentEntries()
                .filter((e) => e.entryType === "payment")
                .map((e) => ({ createdAt: e.createdAt, amountPaise: e.amountPaise })),
            },
            days,
          ),
          statusCounts: statusBreakdown(orders.map((o) => ({ status: o.status }))),
        });
        return;
      }
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.mode !== "live") {
        throw new Error(json?.error ?? "Could not load the charts.");
      }
      setData({ series: json.series ?? [], statusCounts: json.statusCounts ?? [] });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the charts.");
    }
  }, [mode, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-4 rounded-xl border border-admin-border bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-admin-border pb-3">
        <h2 className="text-[15px] font-bold tracking-tight text-admin-heading">
          Trends
        </h2>
        <div className="flex gap-1.5" role="group" aria-label="Chart window">
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              aria-pressed={days === option}
              className={`btn-press min-h-[36px] rounded-full px-3.5 text-[13px] font-bold ${
                days === option
                  ? "bg-brand-600 text-white"
                  : "bg-admin-panel text-admin-muted hover:text-ink-900"
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <div>
          <p className="text-sm font-bold text-red-800">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="btn-press mt-3 inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      ) : !data ? (
        <div aria-label="Loading charts">
          <Skeleton className="h-[180px] w-full" />
          <SkeletonText lines={3} />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em] text-admin-muted">
              Revenue collected
            </h3>
            <RevenueChart series={data.series} />
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-bold uppercase tracking-[0.12em] text-admin-muted">
              Orders placed
            </h3>
            <OrdersChart series={data.series} />
          </div>
          <div className="lg:col-span-2">
            <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-admin-muted">
              Orders by status (now)
            </h3>
            <StatusBars counts={data.statusCounts} />
          </div>
        </div>
      )}
    </section>
  );
}
