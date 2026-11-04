"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPaise } from "@/lib/pricing";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import {
  decidePaymentStatus,
  paymentMethodLabel,
  RECORDABLE_METHODS,
  type OrderFinance,
} from "@/lib/finance";
import { getDemoOrder, updateDemoOrder, type DemoPaymentStatus } from "@/lib/demo-store";
import {
  addDemoPaymentEntry,
  addDemoRefund,
  demoOrderFinance,
  listDemoPaymentEntries,
  listDemoRefunds,
  updateDemoRefund,
  type DemoPaymentEntry,
  type DemoRefund,
} from "@/lib/demo-finance";
import { listDemoEmployees } from "@/lib/demo-org";
import type { Employee } from "@/lib/org";

/**
 * Payments & refunds panel on the admin order page (Phase 9).
 *
 * Shows the one finance computation for the order (gateway payments +
 * staff ledger + legacy rule), lets staff record a payment against the
 * outstanding balance (never more than is owed), and runs the refund
 * workflow: request → approve/reject → process. Processing is the only
 * step that moves money.
 *
 * Live mode talks to /api/admin/orders/[id]/payments and friends;
 * demo mode applies the identical rules to this browser's demo
 * finance store (src/lib/demo-finance.ts).
 */

interface GatewayView {
  id: string;
  gateway: string;
  amountPaise: number;
  status: string;
  createdAt: string;
}

interface EntryView extends DemoPaymentEntry {}

interface RefundView extends DemoRefund {}

interface MoneyView {
  paymentStatus: string;
  finance: OrderFinance;
  gatewayPayments: GatewayView[];
  entries: EntryView[];
  refunds: RefundView[];
}

function rupeesToPaise(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

const inputCls =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";
const labelCls = "grid gap-1.5 text-sm";
const labelTextCls = "font-semibold text-ink-900";

export default function AdminOrderPayments({
  orderId,
  mode,
  orderStatus,
  onChanged,
}: {
  orderId: string;
  mode: "live" | "demo";
  orderStatus: string;
  onChanged: () => void;
}) {
  const [view, setView] = useState<MoneyView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payEmployee, setPayEmployee] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<string>("original_payment");
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const loadDemo = useCallback((): MoneyView | null => {
    const order = getDemoOrder(orderId);
    if (!order) return null;
    return {
      paymentStatus: order.paymentStatus,
      finance: demoOrderFinance(order),
      gatewayPayments: [],
      entries: listDemoPaymentEntries(orderId),
      refunds: listDemoRefunds(orderId),
    };
  }, [orderId]);

  const load = useCallback(async () => {
    if (mode === "demo") {
      const v = loadDemo();
      if (v) setView(v);
      else setLoadError("Demo order not found in this browser.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payments`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.mode !== "live") {
        setLoadError(json?.error ?? "Could not load the payment details.");
        return;
      }
      setView({
        paymentStatus: json.paymentStatus,
        finance: json.finance,
        gatewayPayments: json.gatewayPayments,
        entries: (json.entries as Record<string, unknown>[]).map((e) => ({
          id: e.id as string,
          orderId,
          entryType: e.entryType as "payment" | "refund",
          method: e.method as string,
          amountPaise: e.amountPaise as number,
          reference: (e.reference as string | null) ?? null,
          note: (e.note as string | null) ?? null,
          recordedByEmployeeId: (e.recordedByEmployeeId as string | null) ?? null,
          recordedByEmployeeName: (e.recordedByEmployeeName as string | null) ?? null,
          actorLabel: (e.actorLabel as string | null) ?? null,
          createdAt: e.createdAt as string,
        })),
        refunds: (json.refunds as Record<string, unknown>[]).map((r) => ({
          id: r.id as string,
          orderId,
          amountPaise: r.amountPaise as number,
          reason: r.reason as string,
          method: r.method as string,
          status: r.status as DemoRefund["status"],
          requestedByLabel: (r.requestedByLabel as string | null) ?? null,
          decidedByLabel: (r.decidedByLabel as string | null) ?? null,
          decidedAt: (r.decidedAt as string | null) ?? null,
          processedAt: (r.processedAt as string | null) ?? null,
          createdAt: r.createdAt as string,
        })),
      });
    } catch {
      setLoadError("Could not load the payment details.");
    }
  }, [mode, orderId, loadDemo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode === "demo") {
      setEmployees(listDemoEmployees());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/employees");
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.mode === "live") {
          setEmployees(json.employees as Employee[]);
        }
      } catch {
        // The recorded-by select simply stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  /** After a demo money event, re-derive the demo order's status. */
  function syncDemoOrder(note: string) {
    const order = getDemoOrder(orderId);
    if (!order) return;
    const finance = demoOrderFinance(order);
    const next = decidePaymentStatus(finance);
    if (next && next !== order.paymentStatus) {
      updateDemoOrder(
        orderId,
        { paymentStatus: next as DemoPaymentStatus },
        { status: order.status, note, actor: "admin" },
      );
    } else {
      updateDemoOrder(orderId, {}, { status: order.status, note, actor: "admin" });
    }
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!view) return;
    setPayError(null);
    setFeedback(null);
    const amountPaise = rupeesToPaise(payAmount);
    if (amountPaise === null) {
      setPayError("Enter an amount above zero.");
      return;
    }
    if (amountPaise > view.finance.outstandingPaise) {
      setPayError(
        `That is more than the ${formatPaise(view.finance.outstandingPaise)} outstanding on this order.`,
      );
      return;
    }
    setPayBusy(true);
    try {
      if (mode === "demo") {
        const employee = employees.find((x) => x.id === payEmployee);
        addDemoPaymentEntry({
          orderId,
          entryType: "payment",
          method: payMethod,
          amountPaise,
          reference: payReference.trim() || null,
          note: payNote.trim() || null,
          recordedByEmployeeId: payEmployee || null,
          recordedByEmployeeName: employee?.fullName ?? null,
          actorLabel: "Demo admin",
        });
        const order = getDemoOrder(orderId);
        const after = order ? demoOrderFinance(order) : view.finance;
        syncDemoOrder(
          after.outstandingPaise > 0
            ? `Payment received — ${formatPaise(amountPaise)} via ${paymentMethodLabel(payMethod)}. Balance ${formatPaise(after.outstandingPaise)} (demo).`
            : `Payment received — ${formatPaise(amountPaise)} via ${paymentMethodLabel(payMethod)}. Order paid in full (demo).`,
        );
        setFeedback("Payment recorded (demo).");
      } else {
        const res = await fetch(`/api/admin/orders/${orderId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: payMethod,
            amountPaise,
            reference: payReference.trim() || undefined,
            note: payNote.trim() || undefined,
            recordedByEmployeeId: payEmployee || null,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setPayError(json?.error ?? "The payment could not be recorded.");
          return;
        }
        setFeedback("Payment recorded.");
      }
      setPayAmount("");
      setPayReference("");
      setPayNote("");
      await load();
      onChanged();
    } catch {
      setPayError("The payment could not be recorded. Please try again.");
    } finally {
      setPayBusy(false);
    }
  }

  async function submitRefundRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!view) return;
    setRefundError(null);
    setFeedback(null);
    const amountPaise = rupeesToPaise(refundAmount);
    if (amountPaise === null) {
      setRefundError("Enter an amount above zero.");
      return;
    }
    if (refundReason.trim().length < 3) {
      setRefundError("Give a short reason for the refund.");
      return;
    }
    if (amountPaise > view.finance.refundablePaise) {
      setRefundError(
        `That is more than the ${formatPaise(view.finance.refundablePaise)} still refundable on this order.`,
      );
      return;
    }
    setRefundBusy(true);
    try {
      if (mode === "demo") {
        addDemoRefund({
          orderId,
          amountPaise,
          reason: refundReason.trim(),
          method: refundMethod,
          requestedByLabel: "Demo admin",
        });
        setFeedback("Refund requested (demo). It now needs approval before it can be processed.");
      } else {
        const res = await fetch(`/api/admin/orders/${orderId}/refunds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountPaise,
            reason: refundReason.trim(),
            method: refundMethod,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setRefundError(json?.error ?? "The refund request could not be created.");
          return;
        }
        setFeedback("Refund requested. It now needs approval before it can be processed.");
      }
      setRefundAmount("");
      setRefundReason("");
      await load();
      onChanged();
    } catch {
      setRefundError("The refund request could not be created. Please try again.");
    } finally {
      setRefundBusy(false);
    }
  }

  async function refundAction(refund: RefundView, action: "approve" | "reject" | "process") {
    setActionBusy(refund.id + action);
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
          const order = getDemoOrder(orderId);
          if (order) {
            const finance = demoOrderFinance(order);
            if (refund.amountPaise > finance.effectivePaidPaise - finance.refundsProcessedPaise) {
              setRefundError("This refund can no longer be processed — the money was already returned.");
              return;
            }
          }
          const ledgerMethod =
            refund.method === "original_payment"
              ? (listDemoPaymentEntries(orderId).find((x) => x.entryType === "payment")?.method ?? "cash")
              : refund.method;
          addDemoPaymentEntry({
            orderId,
            entryType: "refund",
            method: ledgerMethod,
            amountPaise: refund.amountPaise,
            reference: null,
            note: `Refund: ${refund.reason}`,
            recordedByEmployeeId: null,
            recordedByEmployeeName: null,
            actorLabel: "Demo admin",
          });
          updateDemoRefund(refund.id, {
            status: "processed",
            decidedByLabel: "Demo admin",
            decidedAt: now,
            processedAt: now,
          });
          syncDemoOrder(
            `Refund processed — ${formatPaise(refund.amountPaise)} returned via ${paymentMethodLabel(ledgerMethod)} (demo).`,
          );
          setFeedback("Refund processed (demo) — the money is recorded as returned.");
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
        setFeedback(
          action === "process"
            ? "Refund processed — the money is recorded as returned."
            : action === "approve"
              ? "Refund approved."
              : "Refund rejected.",
        );
      }
      await load();
      onChanged();
    } catch {
      setRefundError("The refund could not be updated. Please try again.");
    } finally {
      setActionBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
        <h2 className="font-bold text-ink-900">Payments</h2>
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{loadError}</p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="rounded-2xl border border-brand-100 p-4 sm:p-6" aria-label="Loading payments">
        <h2 className="font-bold text-ink-900">Payments</h2>
        <div className="mt-4 grid gap-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const f = view.finance;
  const settled = f.outstandingPaise <= 0;

  return (
    <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
      <h2 className="font-bold text-ink-900">Payments</h2>

      {feedback && (
        <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{feedback}</p>
      )}

      <dl className="mt-4 grid gap-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-ink-500">Order total</dt><dd className="font-semibold text-ink-900">{formatPaise(f.totalPaise)}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-500">Paid so far</dt><dd className="font-semibold text-green-700">{formatPaise(f.effectivePaidPaise)}</dd></div>
        {f.gatewayPaidPaise > 0 && (
          <div className="flex justify-between"><dt className="text-ink-500">· Online / gift card</dt><dd className="text-ink-700">{formatPaise(f.gatewayPaidPaise)}</dd></div>
        )}
        {f.entriesPaidPaise > 0 && (
          <div className="flex justify-between"><dt className="text-ink-500">· Recorded at the desk</dt><dd className="text-ink-700">{formatPaise(f.entriesPaidPaise)}</dd></div>
        )}
        <div className="flex justify-between border-t border-brand-50 pt-2">
          <dt className="font-bold text-ink-900">Outstanding</dt>
          <dd className={`font-extrabold ${settled ? "text-green-700" : "text-amber-800"}`}>
            {settled ? "Settled" : formatPaise(f.outstandingPaise)}
          </dd>
        </div>
        {f.refundsProcessedPaise > 0 && (
          <div className="flex justify-between"><dt className="text-ink-500">Refunded</dt><dd className="font-semibold text-red-700">−{formatPaise(f.refundsProcessedPaise)}</dd></div>
        )}
        <div className="flex justify-between"><dt className="text-ink-500">Payment status</dt><dd className="font-semibold text-ink-900">{view.paymentStatus.replaceAll("_", " ")}</dd></div>
      </dl>

      {f.legacySettled && (
        <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-ink-700">
          This order was settled before the payment ledger existed (marked
          paid at collection), so it counts as paid in full even though no
          ledger rows were written for it.
        </p>
      )}

      {(view.gatewayPayments.some((p) => p.status === "paid") || view.entries.length > 0) && (
        <ul className="mt-4 grid gap-2 border-t border-brand-50 pt-4 text-sm">
          {view.gatewayPayments
            .filter((p) => p.status === "paid")
            .map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-ink-700">
                  {p.gateway === "voucher" ? "Gift card payment" : "Paid online (Razorpay)"}
                  <span className="ml-2 text-xs text-ink-500">{new Date(p.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                </span>
                <span className="font-semibold text-green-700">+{formatPaise(p.amountPaise)}</span>
              </li>
            ))}
          {view.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2">
              <span className="text-ink-700">
                {e.entryType === "refund" ? "Refund" : "Payment"} — {paymentMethodLabel(e.method)}
                {e.reference ? <span className="ml-1 text-xs text-ink-500">({e.reference})</span> : null}
                {e.recordedByEmployeeName ? <span className="ml-1 text-xs text-ink-500">by {e.recordedByEmployeeName}</span> : null}
                <span className="ml-2 text-xs text-ink-500">{new Date(e.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                {e.note ? <span className="block text-xs text-ink-500">{e.note}</span> : null}
              </span>
              <span className={`font-semibold ${e.entryType === "refund" ? "text-red-700" : "text-green-700"}`}>
                {e.entryType === "refund" ? "−" : "+"}{formatPaise(e.amountPaise)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!settled && orderStatus !== "CANCELLED" && (
        <form className="mt-5 grid gap-3 border-t border-brand-50 pt-4" onSubmit={(e) => void submitPayment(e)}>
          <h3 className="text-sm font-bold text-ink-900">Record a payment</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={labelTextCls}>Method</span>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                {RECORDABLE_METHODS.map((m) => (
                  <option key={m} value={m}>{paymentMethodLabel(m)}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>Amount (₹)</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                placeholder={(f.outstandingPaise / 100).toFixed(2)}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>Reference (optional)</span>
              <input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="UPI ref / txn id" className={inputCls} />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>Received by (optional)</span>
              <select value={payEmployee} onChange={(e) => setPayEmployee(e.target.value)} className={inputCls}>
                <option value="">— Not specified —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={labelCls}>
            <span className={labelTextCls}>Note (optional)</span>
            <input value={payNote} onChange={(e) => setPayNote(e.target.value)} maxLength={500} className={inputCls} />
          </label>
          {payError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{payError}</p>}
          <button type="submit" disabled={payBusy} className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto">
            {payBusy ? "Recording…" : "Record payment"}
          </button>
        </form>
      )}

      <div className="mt-6 border-t border-brand-50 pt-4">
        <h3 className="text-sm font-bold text-ink-900">Refunds</h3>
        {refundError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{refundError}</p>}
        {view.refunds.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">No refunds on this order.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {view.refunds.map((r) => (
              <li key={r.id} className="rounded-xl border border-brand-100 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink-900">
                    {formatPaise(r.amountPaise)} · {paymentMethodLabel(r.method)}
                  </p>
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">{r.status}</span>
                </div>
                <p className="mt-1 text-ink-700">{r.reason}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Requested {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  {r.requestedByLabel ? ` by ${r.requestedByLabel}` : ""}
                  {r.decidedByLabel ? ` · decided by ${r.decidedByLabel}` : ""}
                </p>
                {(r.status === "requested" || r.status === "approved") && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {r.status === "requested" && (
                      <>
                        <button type="button" disabled={actionBusy !== null} onClick={() => void refundAction(r, "approve")} className="btn-press min-h-[44px] rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                          Approve
                        </button>
                        <button type="button" disabled={actionBusy !== null} onClick={() => void refundAction(r, "reject")} className="min-h-[44px] rounded-full border border-red-200 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
                          Reject
                        </button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <button type="button" disabled={actionBusy !== null} onClick={() => void refundAction(r, "process")} className="btn-press min-h-[44px] rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60">
                        {actionBusy === r.id + "process" ? "Processing…" : "Process — money returned"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {f.refundablePaise > 0 && (
          <form className="mt-4 grid gap-3" onSubmit={(e) => void submitRefundRequest(e)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                <span className={labelTextCls}>Refund amount (₹)</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={(f.refundablePaise / 100).toFixed(2)} className={inputCls} />
              </label>
              <label className={labelCls}>
                <span className={labelTextCls}>Refund via</span>
                <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} className={inputCls}>
                  <option value="original_payment">Original payment method</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                </select>
              </label>
            </div>
            <label className={labelCls}>
              <span className={labelTextCls}>Reason</span>
              <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={500} placeholder="e.g. Garment damaged in transit" className={inputCls} />
            </label>
            <p className="text-xs leading-relaxed text-ink-500">
              A request moves no money — it holds {refundAmount ? formatPaise(rupeesToPaise(refundAmount) ?? 0) : "the amount"} of the {formatPaise(f.refundablePaise)} refundable until it is approved and processed.
            </p>
            <button type="submit" disabled={refundBusy} className="min-h-[44px] w-full rounded-full border border-brand-600 px-5 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60 sm:w-auto">
              {refundBusy ? "Requesting…" : "Request refund"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
