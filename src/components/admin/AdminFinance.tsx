"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import {
  collectionsByMethod,
  expectedCashPaise,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  isInIstDay,
  istToday,
  paymentMethodLabel,
  type ExpenseCategory,
} from "@/lib/finance";
import { listDemoOrders } from "@/lib/demo-store";
import { listDemoBranches } from "@/lib/demo-org";
import {
  addDemoClosing,
  addDemoExpense,
  deleteDemoExpense,
  demoOrderFinance,
  listDemoClosings,
  listDemoExpenses,
  listDemoPaymentEntries,
  listDemoRefunds,
  updateDemoRefund,
  addDemoPaymentEntry,
  type DemoCashClosing,
  type DemoExpense,
  type DemoRefund,
} from "@/lib/demo-finance";

/**
 * Finance screen (Phase 9): one day's money, the cash closing, who
 * still owes, the refund queue, and the expenses ledger.
 *
 * Live mode reads /api/admin/finance/* + /api/admin/expenses +
 * /api/admin/refunds. Demo mode computes the identical views from this
 * browser's demo finance store (src/lib/demo-finance.ts) — the numbers
 * are the demo store's real entries, never placeholders.
 */

interface Overview {
  date: string;
  collections: { method: string; gatewayPaise: number; entriesPaise: number; totalPaise: number }[];
  totalCollectedPaise: number;
  refundsProcessedPaise: number;
  refundsProcessedCount: number;
  expensesTotalPaise: number;
  netCollectedPaise: number;
  expectedCashPaise: number;
  closing: DemoCashClosing | null;
}

interface OutstandingRow {
  orderId: string;
  status: string;
  customer: string;
  phone: string | null;
  area: string | null;
  totalPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  ageDays: number;
  createdAt: string;
}

interface RefundRow extends DemoRefund {
  customer?: string;
  orderTotalPaise?: number | null;
}

const inputCls =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";
const labelCls = "grid gap-1.5 text-sm";
const labelTextCls = "font-semibold text-ink-900";

function rupeesToPaise(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function AdminFinance({ mode }: { mode: "live" | "demo" }) {
  const [date, setDate] = useState(istToday());
  const [overview, setOverview] = useState<Overview | null>(null);
  const [closings, setClosings] = useState<DemoCashClosing[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [expenses, setExpenses] = useState<DemoExpense[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [countedCash, setCountedCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const [expDate, setExpDate] = useState(istToday());
  const [expCategory, setExpCategory] = useState<string>("detergent");
  const [expDescription, setExpDescription] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expBranch, setExpBranch] = useState("");
  const [expBusy, setExpBusy] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  const [refundBusy, setRefundBusy] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  const loadDemo = useCallback(() => {
    const entries = listDemoPaymentEntries().filter((e) => isInIstDay(e.createdAt, date));
    const collections = collectionsByMethod([], entries);
    const refundsProcessed = entries.filter((e) => e.entryType === "refund");
    const dayExpenses = listDemoExpenses().filter((e) => e.expenseDate === date);
    const allClosings = listDemoClosings();
    setOverview({
      date,
      collections,
      totalCollectedPaise: collections.reduce((s, c) => s + c.totalPaise, 0),
      refundsProcessedPaise: refundsProcessed.reduce((s, e) => s + e.amountPaise, 0),
      refundsProcessedCount: refundsProcessed.length,
      expensesTotalPaise: dayExpenses.reduce((s, e) => s + e.amountPaise, 0),
      netCollectedPaise:
        collections.reduce((s, c) => s + c.totalPaise, 0) -
        refundsProcessed.reduce((s, e) => s + e.amountPaise, 0),
      expectedCashPaise: expectedCashPaise(entries),
      closing: allClosings.find((c) => c.date === date) ?? null,
    });
    setClosings(allClosings);
    setOutstanding(
      listDemoOrders()
        .filter((o) => o.status !== "CANCELLED")
        .map((o) => {
          const f = demoOrderFinance(o);
          return {
            orderId: o.id,
            status: o.status,
            customer: o.name,
            phone: o.phone,
            area: o.area,
            totalPaise: o.totalPaise,
            paidPaise: f.effectivePaidPaise,
            outstandingPaise: f.outstandingPaise,
            ageDays: Math.max(0, Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86_400_000)),
            createdAt: o.createdAt,
          };
        })
        .filter((o) => o.outstandingPaise > 0)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
    setRefunds(
      listDemoRefunds()
        .filter((r) => r.status === "requested" || r.status === "approved")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
    setExpenses(listDemoExpenses());
    setBranches(listDemoBranches().map((b) => ({ id: b.id, name: b.name })));
  }, [date]);

  const loadLive = useCallback(async () => {
    try {
      const [ovRes, outRes, refRes, expRes, closeRes, branchRes] = await Promise.all([
        fetch(`/api/admin/finance/overview?date=${date}`),
        fetch("/api/admin/finance/outstanding"),
        fetch("/api/admin/refunds"),
        fetch("/api/admin/expenses"),
        fetch("/api/admin/finance/closings"),
        fetch("/api/admin/branches"),
      ]);
      const [ov, out, ref, exp, clo, bra] = await Promise.all([
        ovRes.json().catch(() => null),
        outRes.json().catch(() => null),
        refRes.json().catch(() => null),
        expRes.json().catch(() => null),
        closeRes.json().catch(() => null),
        branchRes.json().catch(() => null),
      ]);
      if (!ovRes.ok || ov?.mode !== "live") {
        setLoadError(ov?.error ?? "Could not load the finance overview.");
        return;
      }
      setOverview(ov as Overview);
      setOutstanding((out?.orders ?? []) as OutstandingRow[]);
      setRefunds((ref?.refunds ?? []) as RefundRow[]);
      setExpenses((exp?.expenses ?? []) as DemoExpense[]);
      setClosings((clo?.closings ?? []) as DemoCashClosing[]);
      setBranches(
        ((bra?.branches ?? []) as { id: string; name: string }[]).map((b) => ({ id: b.id, name: b.name })),
      );
    } catch {
      setLoadError("Could not load the finance data.");
    }
  }, [date]);

  const load = useCallback(async () => {
    setLoadError(null);
    if (mode === "demo") loadDemo();
    else await loadLive();
  }, [mode, loadDemo, loadLive]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitClose(e: React.FormEvent) {
    e.preventDefault();
    if (!overview) return;
    setCloseError(null);
    setFeedback(null);
    const counted = rupeesToPaise(countedCash);
    if (counted === null) {
      setCloseError("Enter the counted cash amount (₹0 is allowed).");
      return;
    }
    setCloseBusy(true);
    try {
      if (mode === "demo") {
        if (closings.some((c) => c.date === date)) {
          setCloseError(`${date} has already been closed (demo).`);
          return;
        }
        addDemoClosing({
          date,
          expectedCashPaise: overview.expectedCashPaise,
          countedCashPaise: counted,
          differencePaise: counted - overview.expectedCashPaise,
          closedByLabel: "Demo admin",
          note: closeNote.trim() || null,
        });
        setFeedback(`Day closed (demo) — expected ${formatPaise(overview.expectedCashPaise)}, counted ${formatPaise(counted)}.`);
      } else {
        const res = await fetch("/api/admin/finance/close-day", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, countedCashPaise: counted, note: closeNote.trim() || undefined }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setCloseError(json?.error ?? "The day could not be closed.");
          return;
        }
        setFeedback(`Day closed — expected ${formatPaise(json.expectedCashPaise)}, counted ${formatPaise(json.countedCashPaise)}, difference ${formatPaise(json.differencePaise)}.`);
      }
      setCountedCash("");
      setCloseNote("");
      await load();
    } catch {
      setCloseError("The day could not be closed. Please try again.");
    } finally {
      setCloseBusy(false);
    }
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    setExpError(null);
    setFeedback(null);
    const amountPaise = rupeesToPaise(expAmount);
    if (amountPaise === null || amountPaise <= 0) {
      setExpError("Enter an expense amount above zero.");
      return;
    }
    setExpBusy(true);
    try {
      if (mode === "demo") {
        const branch = branches.find((b) => b.id === expBranch);
        addDemoExpense({
          expenseDate: expDate,
          category: expCategory,
          description: expDescription.trim() || null,
          amountPaise,
          branchId: expBranch || null,
          branchName: branch?.name ?? null,
          actorLabel: "Demo admin",
        });
        setFeedback("Expense recorded (demo).");
      } else {
        const res = await fetch("/api/admin/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expenseDate: expDate,
            category: expCategory,
            description: expDescription.trim() || undefined,
            amountPaise,
            branchId: expBranch || null,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setExpError(json?.error ?? "The expense could not be recorded.");
          return;
        }
        setFeedback("Expense recorded.");
      }
      setExpAmount("");
      setExpDescription("");
      await load();
    } catch {
      setExpError("The expense could not be recorded. Please try again.");
    } finally {
      setExpBusy(false);
    }
  }

  async function deleteExpense(expense: DemoExpense) {
    setExpError(null);
    try {
      if (mode === "demo") {
        deleteDemoExpense(expense.id);
      } else {
        const res = await fetch(`/api/admin/expenses/${expense.id}`, { method: "DELETE" });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setExpError(json?.error ?? "The expense could not be deleted.");
          return;
        }
      }
      setFeedback(mode === "demo" ? "Expense deleted (demo)." : "Expense deleted — the deletion is in the audit log.");
      await load();
    } catch {
      setExpError("The expense could not be deleted. Please try again.");
    }
  }

  async function refundAction(refund: RefundRow, action: "approve" | "reject" | "process") {
    setRefundBusy(refund.id + action);
    setRefundError(null);
    setFeedback(null);
    try {
      if (mode === "demo") {
        const now = new Date().toISOString();
        if (action === "process") {
          if (refund.status !== "approved") {
            setRefundError("Only an approved refund can be processed.");
            return;
          }
          const ledgerMethod =
            refund.method === "original_payment"
              ? (listDemoPaymentEntries(refund.orderId).find((x) => x.entryType === "payment")?.method ?? "cash")
              : refund.method;
          addDemoPaymentEntry({
            orderId: refund.orderId,
            entryType: "refund",
            method: ledgerMethod,
            amountPaise: refund.amountPaise,
            reference: null,
            note: `Refund: ${refund.reason}`,
            recordedByEmployeeId: null,
            recordedByEmployeeName: null,
            actorLabel: "Demo admin",
          });
          updateDemoRefund(refund.id, { status: "processed", decidedByLabel: "Demo admin", decidedAt: now, processedAt: now });
          setFeedback("Refund processed (demo).");
        } else {
          if (refund.status !== "requested") {
            setRefundError(`A refund in status '${refund.status}' cannot be ${action === "approve" ? "approved" : "rejected"}.`);
            return;
          }
          updateDemoRefund(refund.id, {
            status: action === "approve" ? "approved" : "rejected",
            decidedByLabel: "Demo admin",
            decidedAt: now,
          });
          setFeedback(action === "approve" ? "Refund approved (demo)." : "Refund rejected (demo).");
        }
      } else {
        const res = await fetch(`/api/admin/refunds/${refund.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setRefundError(json?.error ?? "The refund could not be updated.");
          return;
        }
        setFeedback(action === "process" ? "Refund processed." : action === "approve" ? "Refund approved." : "Refund rejected.");
      }
      await load();
    } catch {
      setRefundError("The refund could not be updated. Please try again.");
    } finally {
      setRefundBusy(null);
    }
  }

  return (
    <div className="mt-8 grid gap-6">
      {loadError && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{loadError}</p>
      )}
      {feedback && (
        <p role="status" className="rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-800">{feedback}</p>
      )}

      {/* Day summary */}
      <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-bold text-ink-900">Day summary</h2>
          <label className="grid gap-1.5 text-sm">
            <span className={labelTextCls}>Date (IST)</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
        </div>
        {!overview ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading day summary">
            {[0, 1, 2, 3].map((card) => (
              <div key={card} className="rounded-2xl bg-brand-50 p-4">
                <Skeleton className="h-3.5 w-24 max-w-full" />
                <Skeleton className="mt-2 h-6 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Collected", value: formatPaise(overview.totalCollectedPaise) },
                { label: "Refunds processed", value: `−${formatPaise(overview.refundsProcessedPaise)}` },
                { label: "Net collected", value: formatPaise(overview.netCollectedPaise) },
                { label: "Expected cash in drawer", value: formatPaise(overview.expectedCashPaise) },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl bg-brand-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{card.label}</p>
                  <p className="mt-1 text-xl font-extrabold text-ink-900">{card.value}</p>
                </div>
              ))}
            </div>
            {overview.collections.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500">No collections recorded on this date yet.</p>
            ) : (
              <table className="mt-5 w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-ink-500">
                    <th className="py-2 pr-2 font-bold">Method</th>
                    <th className="py-2 pr-2 text-right font-bold">Online / card</th>
                    <th className="py-2 pr-2 text-right font-bold">Recorded at desk</th>
                    <th className="py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.collections.map((c) => (
                    <tr key={c.method} className="border-b border-brand-50">
                      <td className="py-2.5 pr-2 font-semibold text-ink-900">{paymentMethodLabel(c.method)}</td>
                      <td className="py-2.5 pr-2 text-right text-ink-700">{c.gatewayPaise > 0 ? formatPaise(c.gatewayPaise) : "—"}</td>
                      <td className="py-2.5 pr-2 text-right text-ink-700">{c.entriesPaise > 0 ? formatPaise(c.entriesPaise) : "—"}</td>
                      <td className="py-2.5 text-right font-semibold text-ink-900">{formatPaise(c.totalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Expenses on this date: {formatPaise(overview.expensesTotalPaise)}. Expected cash counts
              ledger cash only — online and gift-card money never sits in the drawer.
            </p>

            {/* Close the day */}
            <div className="mt-5 border-t border-brand-50 pt-4">
              {overview.closing ? (
                <p className="rounded-xl bg-brand-50 p-3 text-sm text-ink-700">
                  <span className="font-bold text-ink-900">{overview.date} is closed.</span>{" "}
                  Expected {formatPaise(overview.closing.expectedCashPaise)} · counted{" "}
                  {formatPaise(overview.closing.countedCashPaise)} · difference{" "}
                  <span className={overview.closing.differencePaise === 0 ? "font-semibold text-green-700" : "font-semibold text-amber-800"}>
                    {formatPaise(overview.closing.differencePaise)}
                  </span>
                  {overview.closing.closedByLabel ? ` · by ${overview.closing.closedByLabel}` : ""}
                  {overview.closing.note ? ` · ${overview.closing.note}` : ""}
                </p>
              ) : (
                <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => void submitClose(e)}>
                  <label className={labelCls}>
                    <span className={labelTextCls}>Counted cash (₹)</span>
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} placeholder={(overview.expectedCashPaise / 100).toFixed(2)} className={inputCls} />
                  </label>
                  <label className={labelCls}>
                    <span className={labelTextCls}>Note (optional)</span>
                    <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={500} className={inputCls} />
                  </label>
                  <button type="submit" disabled={closeBusy} className="btn-press min-h-[44px] rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                    {closeBusy ? "Closing…" : "Close the day"}
                  </button>
                  {closeError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 sm:col-span-3">{closeError}</p>}
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {/* Closings history */}
      {closings.length > 0 && (
        <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
          <h2 className="font-bold text-ink-900">Closing history</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-2 font-bold">Date</th>
                  <th className="py-2 pr-2 text-right font-bold">Expected</th>
                  <th className="py-2 pr-2 text-right font-bold">Counted</th>
                  <th className="py-2 pr-2 text-right font-bold">Difference</th>
                  <th className="py-2 font-bold">Closed by</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id} className="border-b border-brand-50">
                    <td className="py-2.5 pr-2 font-semibold text-ink-900">{c.date}</td>
                    <td className="py-2.5 pr-2 text-right text-ink-700">{formatPaise(c.expectedCashPaise)}</td>
                    <td className="py-2.5 pr-2 text-right text-ink-700">{formatPaise(c.countedCashPaise)}</td>
                    <td className={`py-2.5 pr-2 text-right font-semibold ${c.differencePaise === 0 ? "text-green-700" : "text-amber-800"}`}>{formatPaise(c.differencePaise)}</td>
                    <td className="py-2.5 text-ink-700">{c.closedByLabel ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Outstanding balances */}
      <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
        <h2 className="font-bold text-ink-900">
          Outstanding balances{" "}
          <span className="text-sm font-semibold text-ink-500">
            ({outstanding.length} order{outstanding.length === 1 ? "" : "s"} · {formatPaise(outstanding.reduce((s, o) => s + o.outstandingPaise, 0))})
          </span>
        </h2>
        {outstanding.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">Nothing outstanding — every non-cancelled order is settled.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-2 font-bold">Customer</th>
                  <th className="py-2 pr-2 font-bold">Status</th>
                  <th className="py-2 pr-2 text-right font-bold">Total</th>
                  <th className="py-2 pr-2 text-right font-bold">Paid</th>
                  <th className="py-2 pr-2 text-right font-bold">Outstanding</th>
                  <th className="py-2 font-bold">Age</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((o) => (
                  <tr key={o.orderId} className="border-b border-brand-50">
                    <td className="py-2.5 pr-2">
                      <Link href={`/admin/orders/${o.orderId}`} className="font-semibold text-brand-700 hover:underline">
                        {o.customer}
                      </Link>
                      <span className="block text-xs text-ink-500">{o.area ?? ""}{o.phone ? ` · ${o.phone}` : ""}</span>
                    </td>
                    <td className="py-2.5 pr-2 text-ink-700">{o.status.replaceAll("_", " ")}</td>
                    <td className="py-2.5 pr-2 text-right text-ink-700">{formatPaise(o.totalPaise)}</td>
                    <td className="py-2.5 pr-2 text-right text-ink-700">{formatPaise(o.paidPaise)}</td>
                    <td className="py-2.5 pr-2 text-right font-bold text-amber-800">{formatPaise(o.outstandingPaise)}</td>
                    <td className="py-2.5 text-ink-700">{o.ageDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refund queue */}
      <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
        <h2 className="font-bold text-ink-900">Refund queue</h2>
        {refundError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{refundError}</p>}
        {refunds.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">No refunds are waiting. Requests are created on an order&apos;s page.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {refunds.map((r) => (
              <li key={r.id} className="rounded-xl border border-brand-100 p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink-900">
                    {formatPaise(r.amountPaise)} · {paymentMethodLabel(r.method)}
                    {r.customer ? <span className="ml-2 font-normal text-ink-500">{r.customer}</span> : null}
                  </p>
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">{r.status}</span>
                </div>
                <p className="mt-1 text-ink-700">{r.reason}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  <Link href={`/admin/orders/${r.orderId}`} className="font-semibold text-brand-700 hover:underline">Open the order</Link>
                  {" · requested "}
                  {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  {r.requestedByLabel ? ` by ${r.requestedByLabel}` : ""}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {r.status === "requested" && (
                    <>
                      <button type="button" disabled={refundBusy !== null} onClick={() => void refundAction(r, "approve")} className="btn-press min-h-[44px] rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60">Approve</button>
                      <button type="button" disabled={refundBusy !== null} onClick={() => void refundAction(r, "reject")} className="min-h-[44px] rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">Reject</button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <button type="button" disabled={refundBusy !== null} onClick={() => void refundAction(r, "process")} className="btn-press min-h-[44px] rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                      {refundBusy === r.id + "process" ? "Processing…" : "Process — money returned"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Expenses */}
      <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
        <h2 className="font-bold text-ink-900">Expenses</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => void submitExpense(e)}>
          <label className={labelCls}>
            <span className={labelTextCls}>Date</span>
            <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className={inputCls} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>Category</span>
            <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)} className={inputCls}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c as ExpenseCategory]}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>Amount (₹)</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00" className={inputCls} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>Description (optional)</span>
            <input value={expDescription} onChange={(e) => setExpDescription(e.target.value)} maxLength={300} placeholder="e.g. Detergent — 20 kg" className={inputCls} />
          </label>
          <label className={labelCls}>
            <span className={labelTextCls}>Branch (optional)</span>
            <select value={expBranch} onChange={(e) => setExpBranch(e.target.value)} className={inputCls}>
              <option value="">— Whole business —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={expBusy} className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60">
              {expBusy ? "Saving…" : "Add expense"}
            </button>
          </div>
          {expError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 sm:col-span-2 lg:col-span-3">{expError}</p>}
        </form>

        {expenses.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No expenses recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-brand-50">
            {expenses.slice(0, 50).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-ink-700">
                  <span className="font-semibold text-ink-900">{EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] ?? e.category}</span>
                  {e.description ? ` — ${e.description}` : ""}
                  <span className="block text-xs text-ink-500">
                    {e.expenseDate}{e.branchName ? ` · ${e.branchName}` : ""}{e.actorLabel ? ` · by ${e.actorLabel}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold text-ink-900">{formatPaise(e.amountPaise)}</span>
                  <button type="button" onClick={() => void deleteExpense(e)} className="min-h-[44px] rounded-full border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
