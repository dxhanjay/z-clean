"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/lib/finance";
import { buildReports, type Reports } from "@/lib/reports";
import { listDemoOrders } from "@/lib/demo-store";
import { listDemoBranches, listDemoEmployees, listDemoVouchers } from "@/lib/demo-org";
import { listDemoHandovers } from "@/lib/demo-handovers";
import { demoOrderFinance, listDemoExpenses } from "@/lib/demo-finance";
import { services } from "@/lib/services";

/**
 * Reports screen (Phase 9). Live mode reads /api/admin/reports; demo
 * mode runs the SAME aggregation (src/lib/reports.ts) over this
 * browser's demo stores — demo orders, demo handovers, demo vouchers
 * and demo expenses. Sections with no underlying data say so instead
 * of showing invented numbers.
 */

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-50" aria-hidden>
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
      <h2 className="font-bold text-ink-900">{title}</h2>
      {empty ? (
        <p className="mt-3 text-sm text-ink-500">{empty}</p>
      ) : (
        <div className="mt-4">{children}</div>
      )}
    </div>
  );
}

export default function AdminReports({ mode }: { mode: "live" | "demo" }) {
  const [days, setDays] = useState(30);
  const [reports, setReports] = useState<Reports | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDemo = useCallback(() => {
    const now = new Date();
    const periodStart = now.getTime() - days * 86_400_000;
    const demoOrders = listDemoOrders();
    const toReport = (o: (typeof demoOrders)[number]) => ({
      id: o.id,
      createdAt: o.createdAt,
      status: o.status,
      totalPaise: o.totalPaise,
      collectedPaise: demoOrderFinance(o).effectivePaidPaise,
      area: o.area,
      customerKey: o.phone,
      customerLabel: o.name,
      items: o.items.map((i) => ({
        serviceSlug: i.serviceSlug,
        serviceTitle: services.find((s) => s.slug === i.serviceSlug)?.name ?? i.itemName,
        lineTotalPaise: i.lineTotalPaise,
      })),
    });
    const periodOrders = demoOrders
      .filter((o) => new Date(o.createdAt).getTime() >= periodStart)
      .map(toReport);
    const periodIds = new Set(periodOrders.map((o) => o.id));
    const periodExpenses = listDemoExpenses().filter(
      (e) => new Date(`${e.expenseDate}T00:00:00`).getTime() >= periodStart - 86_400_000,
    );
    setReports(
      buildReports({
        periodOrders,
        openOrders: demoOrders.map(toReport),
        allOrders: demoOrders.map(toReport),
        handovers: listDemoHandovers()
          .filter((h) => periodIds.has(h.orderId) || new Date(h.createdAt).getTime() >= periodStart)
          .map((h) => ({
            orderId: h.orderId,
            pointId: h.pointId,
            toEmployeeId: h.toEmployeeId,
            flags: h.flags,
          })),
        employees: listDemoEmployees().map((e) => ({
          id: e.id,
          fullName: e.fullName,
          branchId: e.branchId,
        })),
        branches: listDemoBranches().map((b) => ({ id: b.id, name: b.name })),
        vouchers: listDemoVouchers().map((v) => ({
          kind: v.kind,
          status: v.status,
          balancePaise: v.balancePaise,
        })),
        voucherDiscountPaise: 0,
        voucherRedeemedPaise: 0,
        expenses: periodExpenses.map((e) => ({ category: e.category, amountPaise: e.amountPaise })),
        now,
      }),
    );
  }, [days]);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reports?days=${days}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.mode !== "live") {
        setLoadError(json?.error ?? "Could not load the reports.");
        return;
      }
      setReports(json.reports as Reports);
    } catch {
      setLoadError("Could not load the reports.");
    }
  }, [days]);

  useEffect(() => {
    setLoadError(null);
    if (mode === "demo") loadDemo();
    else void loadLive();
  }, [mode, loadDemo, loadLive]);

  if (loadError) {
    return (
      <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{loadError}</p>
    );
  }
  if (!reports) {
    return <p className="mt-8 text-sm text-ink-500">Loading reports…</p>;
  }

  const r = reports;
  const maxService = Math.max(0, ...r.salesByService.map((s) => s.grossPaise));
  const maxArea = Math.max(0, ...r.salesByArea.map((s) => s.grossPaise));
  const maxPlant = Math.max(0, ...r.processedByPlant.map((s) => s.grossPaise));
  const maxDay = Math.max(0, ...r.salesByDay.map((s) => s.grossPaise));

  return (
    <div className="mt-8 grid gap-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Reporting period">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={`min-h-[44px] rounded-full px-5 py-2 text-sm font-bold ${
              days === d ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"
            }`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Gross sales", value: formatPaise(r.salesVsExpense.grossPaise) },
          { label: "Collected", value: formatPaise(r.salesVsExpense.collectedPaise) },
          { label: "Expenses", value: formatPaise(r.salesVsExpense.expensesPaise) },
          { label: "Net (collected − expenses)", value: formatPaise(r.salesVsExpense.netPaise) },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl bg-brand-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{card.label}</p>
            <p className="mt-1 text-xl font-extrabold text-ink-900">{card.value}</p>
          </div>
        ))}
      </div>

      <Section title="Sales by day" empty={r.salesByDay.length === 0 ? "No orders in this period yet." : null}>
        <ul className="grid gap-2.5">
          {r.salesByDay.map((d) => (
            <li key={d.date} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 text-sm">
              <span className="font-semibold text-ink-900">{d.date.slice(5)}</span>
              <Bar value={d.grossPaise} max={maxDay} />
              <span className="text-ink-700">
                {formatPaise(d.grossPaise)} · {d.orders} order{d.orders === 1 ? "" : "s"} · collected {formatPaise(d.collectedPaise)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sales by service" empty={r.salesByService.length === 0 ? "No item revenue in this period yet." : null}>
          <ul className="grid gap-3">
            {r.salesByService.map((s) => (
              <li key={s.key} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-ink-900">{s.label}</span>
                  <span className="text-ink-700">{formatPaise(s.grossPaise)} · {s.orders} order{s.orders === 1 ? "" : "s"}</span>
                </div>
                <Bar value={s.grossPaise} max={maxService} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Sales by area" empty={r.salesByArea.length === 0 ? "No orders in this period yet." : null}>
          <ul className="grid gap-3">
            {r.salesByArea.map((s) => (
              <li key={s.key} className="grid gap-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-ink-900">{s.label}</span>
                  <span className="text-ink-700">{formatPaise(s.grossPaise)} · {s.orders} order{s.orders === 1 ? "" : "s"}</span>
                </div>
                <Bar value={s.grossPaise} max={maxArea} />
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Processed by plant" empty={r.processedByPlant.length === 0 ? "No orders in this period yet." : null}>
        <ul className="grid gap-3">
          {r.processedByPlant.map((s) => (
            <li key={s.key} className="grid gap-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-ink-900">{s.label}</span>
                <span className="text-ink-700">{formatPaise(s.grossPaise)} · {s.orders} order{s.orders === 1 ? "" : "s"}</span>
              </div>
              <Bar value={s.grossPaise} max={maxPlant} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          A plant is credited when its plant manager receives the order at the
          centre-to-plant handover; orders without that handover show as Unassigned.
        </p>
      </Section>

      <Section title="Pending orders — aging" empty={r.pendingAging.every((b) => b.count === 0) ? "No orders are waiting right now." : null}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {r.pendingAging.map((b) => (
            <div key={b.bucket} className="rounded-2xl bg-brand-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{b.bucket}</p>
              <p className="mt-1 text-2xl font-extrabold text-ink-900">{b.count}</p>
              <ul className="mt-2 grid gap-1 text-xs text-ink-700">
                {b.orders.slice(0, 4).map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">
                      {o.id.length > 14 ? `${o.id.slice(0, 8).toUpperCase()}…` : o.id}
                    </Link>{" "}
                    · {o.status.replaceAll("_", " ")} · {formatPaise(o.totalPaise)}
                  </li>
                ))}
                {b.orders.length > 4 && <li>+{b.orders.length - 4} more</li>}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Employee performance (handovers)" empty={r.employeePerformance.length === 0 ? "No handovers recorded in this period yet." : null}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-2 font-bold">Employee</th>
                <th className="py-2 pr-2 text-right font-bold">Handovers</th>
                <th className="py-2 pr-2 text-right font-bold">Deliveries</th>
                <th className="py-2 text-right font-bold">Flags raised</th>
              </tr>
            </thead>
            <tbody>
              {r.employeePerformance.map((e) => (
                <tr key={e.employeeId} className="border-b border-brand-50">
                  <td className="py-2.5 pr-2 font-semibold text-ink-900">{e.name}</td>
                  <td className="py-2.5 pr-2 text-right text-ink-700">{e.handovers}</td>
                  <td className="py-2.5 pr-2 text-right text-ink-700">{e.deliveries}</td>
                  <td className="py-2.5 text-right text-ink-700">{e.flagsRaised}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Voucher usage" empty={r.voucherUsage.created === 0 ? "No vouchers have been created yet." : null}>
          <dl className="grid gap-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Vouchers created</dt><dd className="font-semibold text-ink-900">{r.voucherUsage.created}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Issued (incl. redeemed)</dt><dd className="font-semibold text-ink-900">{r.voucherUsage.issued}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Redeemed (partly or fully)</dt><dd className="font-semibold text-ink-900">{r.voucherUsage.redeemed}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Gift-card liability outstanding</dt><dd className="font-semibold text-ink-900">{formatPaise(r.voucherUsage.outstandingLiabilityPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Promo discount given (period)</dt><dd className="font-semibold text-ink-900">{formatPaise(r.voucherUsage.discountGivenPaise)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Gift-card value redeemed (period)</dt><dd className="font-semibold text-ink-900">{formatPaise(r.voucherUsage.redeemedValuePaise)}</dd></div>
          </dl>
        </Section>

        <Section title="Customers & retention" empty={r.retention.customers === 0 ? "No customers yet." : null}>
          <dl className="grid gap-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Customers (all time)</dt><dd className="font-semibold text-ink-900">{r.retention.customers}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Repeat customers</dt><dd className="font-semibold text-ink-900">{r.retention.repeatCustomers}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-500">Repeat rate</dt><dd className="font-semibold text-ink-900">{r.retention.repeatRatePercent}%</dd></div>
          </dl>
          {r.retention.topCustomers.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-bold text-ink-900">Top customers</h3>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {r.retention.topCustomers.map((c, idx) => (
                  <li key={idx} className="flex justify-between gap-2">
                    <span className="font-semibold text-ink-900">{c.label}</span>
                    <span className="text-ink-700">{c.orders} order{c.orders === 1 ? "" : "s"} · {formatPaise(c.grossPaise)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      </div>

      <Section title="Expenses by category" empty={r.expensesByCategory.length === 0 ? "No expenses recorded in this period yet." : null}>
        <ul className="grid gap-2 text-sm">
          {r.expensesByCategory.map((e) => (
            <li key={e.category} className="flex justify-between gap-2">
              <span className="font-semibold text-ink-900">{EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] ?? e.category}</span>
              <span className="text-ink-700">{formatPaise(e.totalPaise)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
