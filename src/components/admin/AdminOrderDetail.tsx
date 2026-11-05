"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { nextStatuses, statusLabel } from "@/lib/order-flow";
import OrderTimeline, { type TimelineEvent } from "@/components/OrderTimeline";
import {
  applyDemoStatusChange,
  getDemoOrder,
} from "@/lib/demo-store";
import AdminHandovers, {
  type HandoverView,
  type OtpStateView,
} from "@/components/admin/AdminHandovers";
import AdminOrderPayments from "@/components/admin/AdminOrderPayments";
import AdminOrderAssignments from "@/components/admin/AdminOrderAssignments";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import {
  completedPointIds,
  nextHandoverPoint,
  orderItemCount,
  otpIsLocked,
  qrPayload,
  type HandoverPoint,
} from "@/lib/handovers";
import { listDemoHandovers } from "@/lib/demo-handovers";

/**
 * Admin order detail (Phase 4).
 *
 * - Status update: the select offers ONLY the legal next statuses from
 *   src/lib/order-flow.ts. Submission goes to PATCH
 *   /api/admin/orders/[id]/status, which re-validates everything on the
 *   server (admin role, transition legality, COD rules). In demo mode
 *   the API answers 503 { mode: "demo" } and the same rules are applied
 *   to this browser's demo store via applyDemoStatusChange, appending
 *   demo history — so the admin change appears on the customer's demo
 *   timeline in this same browser.
 * - COD: a standalone "Mark COD collected" button, plus an optional
 *   checkbox to record collection together with a status change (the
 *   natural case: the DELIVERED update). Collection is never forced.
 */

interface DetailItem {
  itemName: string;
  qty: number;
  unitLabel?: string;
  unitPricePaise: number;
  lineTotalPaise: number;
}

interface Detail {
  id: string;
  title: string;
  customer: string;
  phone: string;
  addressLine: string;
  pickupLine: string;
  deliveryType: string;
  items: DetailItem[];
  subtotalPaise: number;
  discountPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  voucherCode: string | null;
  voucherDiscountPaise: number;
  voucherRedeemedPaise: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  history: (TimelineEvent & { actor?: string | null })[];
  createdAt: string;
  // Phase 8 handover chain state.
  itemCount: number;
  qrPayload: string | null;
  otpState: OtpStateView | null;
  handovers: HandoverView[];
  nextPoint: HandoverPoint | null;
}

interface LiveDetailOrder {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_type: string;
  pickup_slot: string;
  subtotal_paise: number;
  discount_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
  voucher_code: string | null;
  voucher_discount_paise: number;
  voucher_redeemed_paise: number;
  created_at: string;
  profiles: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
  addresses: { line: string; area: string | null; city: string; pincode: string } | { line: string; area: string | null; city: string; pincode: string }[] | null;
  items: { itemName: string; qty: number; unitPricePaise: number; lineTotalPaise: number }[];
  history: { status: string; note: string | null; actorId: string | null; at: string }[];
  qr_payload: string | null;
  item_count: number;
  otp_state: {
    pickupSet: boolean;
    pickupUsedAt: string | null;
    deliverySet: boolean;
    deliveryUsedAt: string | null;
    attempts: number;
    locked: boolean;
  } | null;
  handovers: HandoverView[];
  next_point: HandoverPoint | null;
}

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default function AdminOrderDetail({
  id,
  mode,
}: {
  id: string;
  mode: "live" | "demo";
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");
  const [collectWithUpdate, setCollectWithUpdate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Cashier gift-card redemption (Phase 7b) — live mode only.
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemFeedback, setRedeemFeedback] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const loadDemo = useCallback(() => {
    const o = getDemoOrder(id);
    if (!o) {
      setState("missing");
      return;
    }
    const demoHandovers = listDemoHandovers(id);
    setDetail({
      id: o.id,
      title: `Demo order ${o.id}`,
      customer: o.name,
      phone: o.phone,
      addressLine: `${o.addressLine}, ${o.area}, ${o.city} — ${o.pincode}`,
      pickupLine: `${o.pickupDate} · ${o.pickupSlot}`,
      deliveryType: o.deliveryType,
      items: o.items.map((i) => ({
        itemName: i.itemName,
        qty: i.qty,
        unitLabel: i.unitLabel,
        unitPricePaise: i.unitPricePaise,
        lineTotalPaise: i.lineTotalPaise,
      })),
      subtotalPaise: o.subtotalPaise,
      discountPaise: o.discountPaise,
      deliveryFeePaise: o.deliveryFeePaise,
      totalPaise: o.totalPaise,
      voucherCode: null,
      voucherDiscountPaise: 0,
      voucherRedeemedPaise: 0,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      status: o.status,
      history: o.history.map((h) => ({
        status: h.status,
        note: h.note,
        at: h.at,
        actor: h.actor,
      })),
      createdAt: o.createdAt,
      itemCount: orderItemCount(o.items),
      qrPayload: o.qrToken ? qrPayload(o.qrToken) : null,
      otpState: {
        pickupSet: Boolean(o.pickupOtp),
        pickupUsedAt: o.pickupOtpUsedAt ?? null,
        deliverySet: Boolean(o.deliveryOtp),
        deliveryUsedAt: o.deliveryOtpUsedAt ?? null,
        attempts: o.otpAttempts ?? 0,
        locked: otpIsLocked(o.otpAttempts ?? 0),
      },
      handovers: demoHandovers.map((h) => ({
        id: h.id,
        pointId: h.pointId,
        fromStage: h.fromStage,
        toStage: h.toStage,
        method: h.method,
        fromEmployeeName: h.fromEmployeeName,
        toEmployeeName: h.toEmployeeName,
        quantity: h.quantity,
        expectedQuantity: h.expectedQuantity,
        flags: h.flags,
        note: h.note,
        at: h.createdAt,
      })),
      nextPoint: nextHandoverPoint(o.status, completedPointIds(demoHandovers)),
    });
    setState("ready");
  }, [id]);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.mode !== "live") {
        setErrorText(json?.error ?? "Could not load this order.");
        setState(res.status === 404 ? "missing" : "error");
        return;
      }
      const o = json.order as LiveDetailOrder;
      const profile = first(o.profiles);
      const address = first(o.addresses);
      setDetail({
        id: o.id,
        title: `Order ${o.id.slice(0, 8).toUpperCase()}`,
        customer: profile?.name ?? "Customer",
        phone: profile?.phone ?? "",
        addressLine: address
          ? `${address.line}, ${address.area ?? ""}, ${address.city} — ${address.pincode}`
          : "—",
        pickupLine: new Date(o.pickup_slot).toLocaleString("en-IN"),
        deliveryType: o.delivery_type,
        items: o.items.map((i) => ({
          itemName: i.itemName,
          qty: i.qty,
          unitPricePaise: i.unitPricePaise,
          lineTotalPaise: i.lineTotalPaise,
        })),
        subtotalPaise: o.subtotal_paise,
        discountPaise: o.discount_paise,
        deliveryFeePaise: o.delivery_fee_paise,
        totalPaise: o.total_paise,
        voucherCode: o.voucher_code,
        voucherDiscountPaise: o.voucher_discount_paise ?? 0,
        voucherRedeemedPaise: o.voucher_redeemed_paise ?? 0,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        status: o.status,
        history: o.history.map((h) => ({
          status: h.status,
          note: h.note,
          at: h.at,
          actor: h.actorId ? "admin/staff" : "system",
        })),
        createdAt: o.created_at,
        itemCount: o.item_count ?? 0,
        qrPayload: o.qr_payload,
        otpState: o.otp_state,
        handovers: o.handovers ?? [],
        nextPoint: o.next_point,
      });
      setState("ready");
    } catch {
      setErrorText("Could not load this order.");
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    if (mode === "demo") {
      loadDemo();
    } else {
      void loadLive();
    }
  }, [mode, loadDemo, loadLive]);

  const allowed = detail ? nextStatuses(detail.status) : [];
  const codCollectible =
    detail?.paymentMethod === "cod" && detail?.paymentStatus === "cod_pending";

  useEffect(() => {
    setNewStatus(allowed[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.status]);

  async function submitChange(change: { status?: string; codCollected?: boolean }) {
    if (!detail) return;
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${detail.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: change.status,
          note: note.trim() || undefined,
          codCollected: change.codCollected || undefined,
        }),
      });
      const json = await res.json().catch(() => null);

      if (res.status === 503 && json?.mode === "demo") {
        // Demo mode: apply the same rules to the browser demo store.
        const result = applyDemoStatusChange(detail.id, {
          status: change.status,
          note: note.trim() || undefined,
          codCollected: change.codCollected,
        });
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        setFeedback("Demo order updated — check the customer view to see the timeline move.");
        setNote("");
        setCollectWithUpdate(false);
        loadDemo();
        return;
      }
      if (!res.ok) {
        setFormError(json?.error ?? "Could not update the order.");
        return;
      }
      setFeedback("Order updated.");
      setNote("");
      setCollectWithUpdate(false);
      await loadLive();
    } catch {
      setFormError("Could not update the order. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRedeem() {
    if (!detail) return;
    setRedeemBusy(true);
    setRedeemFeedback(null);
    setRedeemError(null);
    try {
      const res = await fetch(`/api/admin/orders/${detail.id}/redeem-voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: redeemCode.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRedeemError(json?.error ?? "The gift card could not be redeemed.");
        return;
      }
      setRedeemFeedback(
        `Redeemed ${formatPaise(json.redeemedPaise)} from the gift card. ` +
          (json.outstandingPaise > 0
            ? `${formatPaise(json.outstandingPaise)} is still outstanding on this order.`
            : "The order is now paid in full."),
      );
      setRedeemCode("");
      await loadLive();
    } catch {
      setRedeemError("The gift card could not be redeemed. Please try again.");
    } finally {
      setRedeemBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <div aria-label="Loading order">
        <Skeleton className="h-4 w-28" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-56 max-w-[60%]" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid min-w-0 content-start gap-6">
            {[0, 1].map((card) => (
              <div key={card} className="rounded-2xl border border-brand-100 p-4 sm:p-6">
                <Skeleton className="h-5 w-36 max-w-full" />
                <SkeletonText lines={3} className="mt-3" />
              </div>
            ))}
          </div>
          <div className="grid min-w-0 content-start gap-6">
            {[0, 1].map((card) => (
              <div key={card} className="rounded-2xl border border-brand-100 p-4 sm:p-6">
                <Skeleton className="h-5 w-32 max-w-full" />
                <SkeletonText lines={2} className="mt-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (state === "missing") {
    return (
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Order not found</h1>
        <p className="mt-3 text-sm text-ink-500">
          {mode === "demo"
            ? "No demo order with this id exists in this browser."
            : "This order does not exist."}
        </p>
        <Link href="/admin/orders" className="btn-press mt-5 inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700">
          Back to the queue
        </Link>
      </div>
    );
  }
  if (state === "error" || !detail) {
    return (
      <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {errorText ?? "Could not load this order."}
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold text-brand-700">
        <Link href="/admin/orders" className="hover:underline">← Order queue</Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          {detail.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
            {detail.status.replaceAll("_", " ")}
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
            {detail.paymentMethod === "cod" ? "Pay on Delivery" : "Online (Razorpay)"} ·{" "}
            {detail.paymentStatus.replaceAll("_", " ")}
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-500">
        Customer view:{" "}
        <Link href={`/orders/${detail.id}`} className="font-semibold text-brand-700 hover:underline">
          /orders/{detail.id.length > 14 ? `${detail.id.slice(0, 8)}…` : detail.id}
        </Link>
        {" · "}
        <Link href={`/orders/${detail.id}/receipt`} className="font-semibold text-brand-700 hover:underline">
          Receipt / Print
        </Link>
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 content-start gap-6">
          <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
            <h2 className="font-bold text-ink-900">Customer &amp; pickup</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div><dt className="text-ink-500">Customer</dt><dd className="font-semibold text-ink-900">{detail.customer}{detail.phone ? ` · ${detail.phone}` : ""}</dd></div>
              <div><dt className="text-ink-500">Address</dt><dd className="font-semibold text-ink-900">{detail.addressLine}</dd></div>
              <div><dt className="text-ink-500">Pickup</dt><dd className="font-semibold text-ink-900">{detail.pickupLine}</dd></div>
              <div><dt className="text-ink-500">Delivery speed</dt><dd className="font-semibold text-ink-900">{detail.deliveryType === "express" ? "Express (1.5×)" : "Regular"}</dd></div>
            </dl>
          </div>

          <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
            <h2 className="font-bold text-ink-900">Items &amp; totals</h2>
            <ul className="mt-4 divide-y divide-brand-50">
              {detail.items.map((item, idx) => (
                <li key={idx} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-semibold text-ink-900">{item.itemName}</p>
                    <p className="text-ink-500">
                      {item.qty} × {formatPaise(item.unitPricePaise)}
                      {item.unitLabel ? ` (${item.unitLabel})` : ""}
                    </p>
                  </div>
                  <p className="font-bold text-ink-900">{formatPaise(item.lineTotalPaise)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid gap-1.5 border-t border-brand-50 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="font-semibold text-ink-900">{formatPaise(detail.subtotalPaise)}</dd></div>
              {detail.discountPaise > 0 && (
                <div className="flex justify-between"><dt className="text-green-700">Discount</dt><dd className="font-semibold text-green-700">−{formatPaise(detail.discountPaise)}</dd></div>
              )}
              {detail.voucherDiscountPaise > 0 && (
                <div className="flex justify-between"><dt className="text-green-700">Voucher discount{detail.voucherCode ? ` (${detail.voucherCode})` : ""}</dt><dd className="font-semibold text-green-700">−{formatPaise(detail.voucherDiscountPaise)}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-ink-500">Pickup &amp; delivery</dt><dd className="font-semibold text-ink-900">{detail.deliveryFeePaise === 0 ? "Free" : formatPaise(detail.deliveryFeePaise)}</dd></div>
              <div className="flex justify-between border-t border-brand-50 pt-2 text-base"><dt className="font-bold text-ink-900">Total</dt><dd className="font-extrabold text-ink-900">{formatPaise(detail.totalPaise)}</dd></div>
              {detail.voucherRedeemedPaise > 0 && (
                <div className="flex justify-between"><dt className="text-ink-500">Paid with gift card{detail.voucherCode ? ` ${detail.voucherCode}` : ""}</dt><dd className="font-semibold text-green-700">{formatPaise(detail.voucherRedeemedPaise)}</dd></div>
              )}
              {detail.paymentStatus !== "paid" && detail.voucherRedeemedPaise > 0 && (
                <div className="flex justify-between"><dt className="text-ink-500">Still outstanding</dt><dd className="font-semibold text-ink-900">{formatPaise(Math.max(0, detail.totalPaise - detail.voucherRedeemedPaise))}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-ink-500">Payment</dt><dd className="font-semibold text-ink-900">{detail.paymentMethod === "cod" ? "Pay on Delivery" : "Online (Razorpay)"} — {detail.paymentStatus.replaceAll("_", " ")}</dd></div>
            </dl>
          </div>

          <OrderTimeline
            status={detail.status}
            history={detail.history}
            createdAt={detail.createdAt}
          />
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
            <h2 className="font-bold text-ink-900">Update status</h2>
            {feedback && (
              <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
                {feedback}
              </p>
            )}
            {formError && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
                {formError}
              </p>
            )}

            {allowed.length > 0 ? (
              <form
                className="mt-4 grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitChange({
                    status: newStatus,
                    codCollected: codCollectible && collectWithUpdate,
                  });
                }}
              >
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-ink-900">Move to</span>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="min-h-[44px] rounded-xl border border-brand-200 px-3 py-2.5 text-sm font-semibold text-ink-900"
                  >
                    {allowed.map((s) => (
                      <option key={s} value={s}>{statusLabel(s)}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-ink-900">Note (optional, shown to the customer)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="e.g. Pickup rider is on the way"
                    className="rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none"
                  />
                </label>
                {codCollectible && (
                  <label className="flex items-start gap-2.5 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={collectWithUpdate}
                      onChange={(e) => setCollectWithUpdate(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
                    />
                    <span>
                      Also record the Pay-on-Delivery collection (
                      {formatPaise(Math.max(0, detail.totalPaise - detail.voucherRedeemedPaise))}) with this update —
                      the usual choice when marking the order Delivered.
                    </span>
                  </label>
                )}
                <button
                  type="submit"
                  disabled={busy || !newStatus}
                  className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
                >
                  {busy ? "Saving…" : "Save status update"}
                </button>
              </form>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink-500">
                {detail.status === "DELIVERED" || detail.status === "CANCELLED"
                  ? "This order is finished — no further status moves are possible."
                  : "No status moves are available for this order right now. Payment side-states are handled by the payment flow, not from here."}
              </p>
            )}

            {codCollectible && (
              <div className="mt-6 border-t border-brand-50 pt-4">
                <h3 className="text-sm font-bold text-ink-900">Pay on Delivery</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                  {formatPaise(Math.max(0, detail.totalPaise - detail.voucherRedeemedPaise))} is still to collect from
                  the customer. Record it here the moment the cash / UPI is
                  in hand — no status change needed.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitChange({ codCollected: true })}
                  className="mt-3 min-h-[44px] w-full rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60 sm:w-auto"
                >
                  Mark COD collected
                </button>
              </div>
            )}
          </div>

          <AdminHandovers
            orderId={detail.id}
            mode={mode}
            status={detail.status}
            paymentMethod={detail.paymentMethod}
            paymentStatus={detail.paymentStatus}
            outstandingPaise={Math.max(0, detail.totalPaise - detail.voucherRedeemedPaise)}
            itemCount={detail.itemCount}
            qrPayload={detail.qrPayload}
            otpState={detail.otpState}
            handovers={detail.handovers}
            nextPoint={detail.nextPoint}
            onChanged={() => {
              if (mode === "demo") loadDemo();
              else void loadLive();
            }}
          />

          <AdminOrderAssignments orderId={detail.id} mode={mode} />

          <AdminOrderPayments
            orderId={detail.id}
            mode={mode}
            orderStatus={detail.status}
            onChanged={() => {
              if (mode === "demo") loadDemo();
              else void loadLive();
            }}
          />

          {detail.paymentStatus !== "paid" && (
            <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
              <h2 className="font-bold text-ink-900">Redeem gift card</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                The customer can pay part or all of the{" "}
                {formatPaise(Math.max(0, detail.totalPaise - detail.voucherRedeemedPaise))}{" "}
                outstanding with a prepaid Z-clean gift card. The card pays
                up to its remaining balance; if that clears the balance, the
                order is marked paid. Promo vouchers are checkout-only and
                cannot be redeemed here.
              </p>
              {mode === "demo" ? (
                <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                  DEMO MODE — redemption moves a real card balance, so it is
                  available in live mode only. Nothing is redeemed here.
                </p>
              ) : (
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitRedeem();
                  }}
                >
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold text-ink-900">Gift card code</span>
                    <input
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                      placeholder="ZCGIFT-XXXXXXXX"
                      className="min-h-[44px] rounded-xl border border-brand-200 px-3 py-2.5 text-sm uppercase text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none"
                    />
                  </label>
                  {redeemFeedback && (
                    <p role="status" className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
                      {redeemFeedback}
                    </p>
                  )}
                  {redeemError && (
                    <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
                      {redeemError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={redeemBusy || redeemCode.trim().length < 4}
                    className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
                  >
                    {redeemBusy ? "Redeeming…" : "Redeem gift card"}
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
            <h2 className="font-bold text-ink-900">Activity log</h2>
            {detail.history.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">No recorded events yet.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {[...detail.history].reverse().map((h, idx) => (
                  <li key={idx} className="border-b border-brand-50 pb-3 text-sm last:border-0 last:pb-0">
                    <p className="font-semibold text-ink-900">
                      {h.status.replaceAll("_", " ")}
                      {h.actor ? <span className="ml-2 text-xs font-semibold text-ink-500">by {h.actor}</span> : null}
                    </p>
                    <p className="text-xs text-ink-500">
                      {new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    {h.note && <p className="mt-0.5 leading-relaxed text-ink-500">{h.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
