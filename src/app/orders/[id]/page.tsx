"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { businessSettings, hasRazorpayPaymentLink } from "@/lib/config";
import { isPaymentRetryEligible } from "@/lib/payment-retry";
import { loadRazorpayScript } from "@/lib/razorpay-checkout";
import OrderTimeline, { type TimelineEvent } from "@/components/OrderTimeline";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import {
  getDemoOrder,
  updateDemoOrder,
  type DemoOrder,
} from "@/lib/demo-store";
import {
  handoverFlagLabel,
  handoverPoint,
  qrPayload,
} from "@/lib/handovers";
import { listDemoHandovers } from "@/lib/demo-handovers";
import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Order detail: items, totals breakdown, payment method/status, pickup
 * details, and (Phase 4) the tracking timeline — canonical steps from
 * src/lib/order-flow.ts with timestamps/notes from the order's status
 * history (live order_status_history, or the demo order's history).
 *
 * Modes mirror the rest of the app: live orders are fetched from
 * /api/orders/[id] (RLS owner-only); in DEMO MODE the order comes from
 * this browser's demo store and is badged as such.
 */

interface LiveOrderItem {
  itemName: string;
  serviceSlug: string;
  qty: number;
  unitPricePaise: number;
  lineTotalPaise: number;
}

interface LiveOrder {
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
  addresses: { line: string; area: string | null; city: string; pincode: string } | null;
  items: LiveOrderItem[];
  /** Phase 9 money summary (null until schema v5 data is composed). */
  finance?: {
    effectivePaidPaise: number;
    outstandingPaise: number;
    refundsProcessedPaise: number;
    legacySettled: boolean;
  } | null;
  history?: TimelineEvent[];
  qr_payload: string | null;
  pickup_otp: string | null;
  delivery_otp: string | null;
  handover_milestones?: {
    pointId: string;
    label: string;
    fromLabel: string;
    toLabel: string;
    method: string;
    quantity: number;
    flags: string[];
    at: string;
  }[];
}

function StatusBadge({ label, tone }: { label: string; tone: "brand" | "amber" | "green" | "red" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-800",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  } as const;
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>
      {label.replaceAll("_", " ")}
    </span>
  );
}

/** The order's QR code, rendered from its payload (Phase 8). */
function OrderQrImage({ payload }: { payload: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const data = await QRCode.toDataURL(payload, { width: 168, margin: 1 });
        if (!cancelled) setUrl(data);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);
  if (!url) {
    return (
      <div className="flex h-[168px] w-[168px] items-center justify-center rounded-xl bg-white p-3 text-center text-xs text-ink-500">
        QR code unavailable — our rider can use your OTP instead.
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Your order QR code" className="h-[168px] w-[168px] rounded-xl bg-white p-1" />;
}

function paymentTone(status: string): "brand" | "amber" | "green" | "red" {
  if (status === "paid") return "green";
  if (status === "failed") return "red";
  // Phase 9 added 'partially_paid' (amber, like cod_pending) and the
  // enum already carried 'refunded' (brand) — both render as plain
  // badges via the label, no special handling needed beyond tone.
  if (status === "cod_pending" || status === "partially_paid") return "amber";
  return "brand";
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [demoOrder, setDemoOrder] = useState<DemoOrder | null>(null);
  const [liveOrder, setLiveOrder] = useState<LiveOrder | null>(null);
  const [state, setState] = useState<"loading" | "demo" | "live" | "missing">("loading");
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryNote, setRetryNote] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function load() {
    if (isSupabaseConfigured()) {
      try {
        const res = await fetch(`/api/orders/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.mode === "live") {
            setLiveOrder(json.order as LiveOrder);
            setState("live");
            return;
          }
        }
      } catch {
        // fall through to demo lookup
      }
    }
    const local = getDemoOrder(id);
    if (local) {
      setDemoOrder(local);
      setState("demo");
    } else {
      setState("missing");
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  /**
   * Retry payment (Phase 5a, live mode): ask the server for a NEW
   * Razorpay gateway order, then open Checkout with it. The handler is
   * cosmetic — only the verified webhook marks this order paid.
   */
  async function retryPayment() {
    setRetryBusy(true);
    setRetryNote(null);
    try {
      const res = await fetch(`/api/orders/${id}/retry-payment`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        payment?: {
          gatewayConfigured?: boolean;
          gatewayOrderId?: string;
          amountPaise?: number;
          keyId?: string;
        };
      };
      if (!res.ok) {
        setRetryNote({
          kind: "error",
          text: json.error ?? "Payment could not be restarted. Please try again.",
        });
        return;
      }
      if (!json.payment?.gatewayConfigured || !json.payment.gatewayOrderId || !json.payment.keyId) {
        setRetryNote({
          kind: "info",
          text: hasRazorpayPaymentLink
            ? "Online checkout is not switched on yet — please use the Razorpay payment link below to pay for this order."
            : "Online payment is being set up — our team will contact you to complete this payment. Nothing has been charged.",
        });
        return;
      }
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setRetryNote({
          kind: "error",
          text: "The payment window could not be opened. Please check your connection and try again — nothing has been charged.",
        });
        return;
      }
      const rzp = new window.Razorpay({
        key: json.payment.keyId,
        amount: json.payment.amountPaise ?? liveOrder?.total_paise ?? 0,
        currency: "INR",
        name: "Z-clean",
        description: "Laundry & dry cleaning order (payment retry)",
        order_id: json.payment.gatewayOrderId,
        handler: () => {
          setRetryNote({
            kind: "info",
            text: "Payment submitted. We confirm every payment with Razorpay on our server before marking an order paid — this page will show “paid” as soon as that confirmation arrives.",
          });
          void load();
        },
        modal: {
          ondismiss: () =>
            setRetryNote({
              kind: "info",
              text: "The payment window was closed. This order is still payment pending — you can retry any time. Nothing has been charged.",
            }),
        },
        theme: { color: "#0f766e" },
      });
      rzp.open();
    } catch {
      setRetryNote({
        kind: "error",
        text: "Network error. Please check your connection and try again.",
      });
    } finally {
      setRetryBusy(false);
    }
  }

  function simulate(success: boolean) {
    if (!demoOrder) return;
    const updated = updateDemoOrder(
      demoOrder.id,
      success
        ? { paymentStatus: "paid", status: "PICKUP_SCHEDULED" }
        : { paymentStatus: "failed", status: "PAYMENT_FAILED" },
      success
        ? {
            status: "PICKUP_SCHEDULED",
            note: "Online payment confirmed (demo simulation). Pickup scheduled.",
            actor: "system",
          }
        : {
            status: "PAYMENT_FAILED",
            note: "Online payment failed (demo simulation).",
            actor: "system",
          },
    );
    if (updated) setDemoOrder(updated);
  }

  if (state === "loading") {
    return (
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6" aria-label="Loading your order">
        <Skeleton className="h-4 w-28" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-8 w-56 max-w-[60%]" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
        </div>
        <div className="mt-8 rounded-2xl border border-brand-100 p-6">
          <Skeleton className="h-5 w-32" />
          <div className="mt-5 grid gap-4">
            {[0, 1, 2].map((step) => (
              <div key={step} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-48 max-w-[70%]" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-2xl border border-brand-100 p-6">
            <Skeleton className="h-5 w-20" />
            <SkeletonText lines={3} className="mt-4" />
          </div>
          <div className="grid content-start gap-6">
            {[0, 1].map((card) => (
              <div key={card} className="rounded-2xl border border-brand-100 p-6">
                <Skeleton className="h-5 w-24" />
                <SkeletonText lines={3} className="mt-3" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (state === "missing") {
    return (
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Order not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          We could not find this order. If you placed it in demo mode, it is
          stored in the browser where you placed it. Signed-in orders need you
          to be logged in with the same account.
        </p>
        <Link href="/dashboard" className="mt-5 inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700">
          Go to my dashboard
        </Link>
      </section>
    );
  }

  const isDemo = state === "demo";
  const orderId = isDemo ? demoOrder!.id : liveOrder!.id;
  const status = isDemo ? demoOrder!.status : liveOrder!.status;
  const paymentStatus = isDemo ? demoOrder!.paymentStatus : liveOrder!.payment_status;
  const paymentMethod = isDemo ? demoOrder!.paymentMethod : liveOrder!.payment_method;
  const deliveryType = isDemo ? demoOrder!.deliveryType : liveOrder!.delivery_type;
  const subtotal = isDemo ? demoOrder!.subtotalPaise : liveOrder!.subtotal_paise;
  const discount = isDemo ? demoOrder!.discountPaise : liveOrder!.discount_paise;
  const fee = isDemo ? demoOrder!.deliveryFeePaise : liveOrder!.delivery_fee_paise;
  const total = isDemo ? demoOrder!.totalPaise : liveOrder!.total_paise;
  const coupon = isDemo ? demoOrder!.couponCode : undefined;
  const voucherCode = isDemo ? null : liveOrder!.voucher_code;
  const voucherDiscount = isDemo ? 0 : (liveOrder!.voucher_discount_paise ?? 0);
  const voucherRedeemed = isDemo ? 0 : (liveOrder!.voucher_redeemed_paise ?? 0);
  // Phase 9: the finance block (when the API composed it) is the true
  // outstanding — it counts desk payments too, not just gift cards.
  const outstandingDue = isDemo
    ? Math.max(0, total - voucherRedeemed)
    : (liveOrder!.finance?.outstandingPaise ?? Math.max(0, total - voucherRedeemed));
  const items = isDemo
    ? demoOrder!.items.map((i) => ({
        itemName: i.itemName,
        qty: i.qty,
        unitLabel: i.unitLabel,
        unitPricePaise: i.unitPricePaise,
        lineTotalPaise: i.lineTotalPaise,
      }))
    : liveOrder!.items.map((i) => ({
        itemName: i.itemName,
        qty: i.qty,
        unitLabel: "",
        unitPricePaise: i.unitPricePaise,
        lineTotalPaise: i.lineTotalPaise,
      }));
  const pickupLine = isDemo
    ? `${demoOrder!.pickupDate} · ${demoOrder!.pickupSlot}`
    : new Date(liveOrder!.pickup_slot).toLocaleString("en-IN");
  const addressLine = isDemo
    ? `${demoOrder!.addressLine}, ${demoOrder!.area}, ${demoOrder!.city} — ${demoOrder!.pincode}`
    : liveOrder!.addresses
      ? `${liveOrder!.addresses.line}, ${liveOrder!.addresses.area ?? ""}, ${liveOrder!.addresses.city} — ${liveOrder!.addresses.pincode}`
      : "—";
  const customerLine = isDemo ? `${demoOrder!.name} · ${demoOrder!.phone}` : null;
  const timelineHistory: TimelineEvent[] = isDemo
    ? demoOrder!.history.map((h) => ({ status: h.status, note: h.note, at: h.at }))
    : (liveOrder!.history ?? []);
  const orderCreatedAt = isDemo ? demoOrder!.createdAt : liveOrder!.created_at;
  const liveRetryEligible =
    !isDemo &&
    isPaymentRetryEligible({ paymentMethod, paymentStatus, status });

  /* Phase 8 — handover codes + milestones. OTPs show only until used
     (the live API nulls them once used; the demo order tracks usedAt
     the same way). Milestones carry point/role labels only — never
     employee names. */
  const orderQrPayload = isDemo
    ? demoOrder!.qrToken
      ? qrPayload(demoOrder!.qrToken)
      : null
    : liveOrder!.qr_payload;
  const pickupOtp = isDemo
    ? demoOrder!.pickupOtpUsedAt
      ? null
      : (demoOrder!.pickupOtp ?? null)
    : liveOrder!.pickup_otp;
  const deliveryOtp = isDemo
    ? demoOrder!.deliveryOtpUsedAt
      ? null
      : (demoOrder!.deliveryOtp ?? null)
    : liveOrder!.delivery_otp;
  const milestones = isDemo
    ? listDemoHandovers(orderId).map((h) => {
        const point = handoverPoint(h.pointId);
        return {
          pointId: h.pointId,
          label: point?.customerLabel ?? h.pointId,
          fromLabel: point?.fromLabel ?? h.fromStage,
          toLabel: point?.toLabel ?? h.toStage,
          method: h.method,
          quantity: h.quantity,
          flags: h.flags as string[],
          at: h.createdAt,
        };
      })
    : (liveOrder!.handover_milestones ?? []);
  const showCodes =
    Boolean(orderQrPayload) && status !== "DELIVERED" && status !== "CANCELLED";

  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-sm font-semibold text-brand-700">
        <Link href="/dashboard" className="hover:underline">← My dashboard</Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          Order {orderId.length > 14 ? `${orderId.slice(0, 8).toUpperCase()}…` : orderId}
        </h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={status} tone="brand" />
          <StatusBadge label={paymentStatus} tone={paymentTone(paymentStatus)} />
        </div>
      </div>

      {isDemo && (
        <div role="status" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          DEMO MODE — this is a demo order stored in this browser only. No
          real order, pickup or payment exists.
        </div>
      )}

      <div className="mt-8">
        <OrderTimeline
          status={status}
          history={timelineHistory}
          createdAt={orderCreatedAt}
        />
      </div>

      {showCodes && orderQrPayload && (
        <div className="mt-6 rounded-2xl border border-brand-100 p-6">
          <h2 className="font-bold text-ink-900">Your pickup &amp; delivery codes</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            Every handover of your laundry is verified. At pickup and at
            delivery, tell our rider the OTP — or let them scan this QR
            code. Each code works once, for this order only.
          </p>
          <div className="mt-4 flex flex-wrap items-start gap-5">
            <OrderQrImage payload={orderQrPayload} />
            <div className="grid min-w-[220px] flex-1 gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Pickup OTP
                </p>
                {pickupOtp ? (
                  <p className="mt-1 text-3xl font-extrabold tracking-[0.35em] text-ink-900">
                    {pickupOtp}
                  </p>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    {status === "PICKED_UP" || milestones.some((m) => m.pointId === "pickup")
                      ? "Used at pickup ✓"
                      : "Being generated — if our rider arrives before it appears here, they can use the QR code instead."}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Delivery OTP
                </p>
                {deliveryOtp ? (
                  <p className="mt-1 text-3xl font-extrabold tracking-[0.35em] text-ink-900">
                    {deliveryOtp}
                  </p>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    Used at delivery ✓
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {milestones.length > 0 && (
        <div className="mt-6 rounded-2xl border border-brand-100 p-6">
          <h2 className="font-bold text-ink-900">Handover record</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            Each verified transfer of your items, in order.
          </p>
          <ol className="mt-4 grid gap-3">
            {milestones.map((m) => (
              <li key={`${m.pointId}-${m.at}`} className="flex gap-3 text-sm">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[11px] font-extrabold text-white">
                  ✓
                </span>
                <div>
                  <p className="font-semibold text-ink-900">
                    {m.label}
                    <span className="ml-2 text-xs font-semibold text-ink-500">
                      {m.fromLabel} → {m.toLabel} · {m.quantity} item
                      {m.quantity === 1 ? "" : "s"} ·{" "}
                      {m.method === "otp" ? "verified by OTP" : "verified by QR scan"}
                    </span>
                  </p>
                  <p className="text-xs text-ink-500">
                    {new Date(m.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  {m.flags.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {m.flags.map((f) => (
                        <span key={f} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                          {handoverFlagLabel(f)} — our team is checking
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-2xl border border-brand-100 p-6">
          <h2 className="font-bold text-ink-900">Items</h2>
          <ul className="mt-4 divide-y divide-brand-50">
            {items.map((item, idx) => (
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
            <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="font-semibold text-ink-900">{formatPaise(subtotal)}</dd></div>
            {discount > 0 && (
              <div className="flex justify-between"><dt className="text-green-700">Discount{coupon ? ` (${coupon})` : ""}</dt><dd className="font-semibold text-green-700">−{formatPaise(discount)}</dd></div>
            )}
            {voucherDiscount > 0 && (
              <div className="flex justify-between"><dt className="text-green-700">Voucher discount{voucherCode ? ` (${voucherCode})` : ""}</dt><dd className="font-semibold text-green-700">−{formatPaise(voucherDiscount)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-ink-500">Pickup &amp; delivery</dt><dd className="font-semibold text-ink-900">{fee === 0 ? "Free" : formatPaise(fee)}</dd></div>
            <div className="flex justify-between border-t border-brand-50 pt-2 text-base"><dt className="font-bold text-ink-900">Total</dt><dd className="font-extrabold text-ink-900">{formatPaise(total)}</dd></div>
          </dl>
        </div>

        <div className="grid content-start gap-6">
          <div className="rounded-2xl border border-brand-100 p-6">
            <h2 className="font-bold text-ink-900">Pickup</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div><dt className="text-ink-500">When</dt><dd className="font-semibold text-ink-900">{pickupLine}</dd></div>
              <div><dt className="text-ink-500">Where</dt><dd className="font-semibold text-ink-900">{addressLine}</dd></div>
              {customerLine && (
                <div><dt className="text-ink-500">Customer</dt><dd className="font-semibold text-ink-900">{customerLine}</dd></div>
              )}
              <div><dt className="text-ink-500">Delivery speed</dt><dd className="font-semibold text-ink-900">{deliveryType === "express" ? "Express (1.5×)" : "Regular"}</dd></div>
            </dl>
          </div>

          <div className="rounded-2xl border border-brand-100 p-6">
            <h2 className="font-bold text-ink-900">Payment</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div><dt className="text-ink-500">Method</dt><dd className="font-semibold text-ink-900">{paymentMethod === "cod" ? "Pay on Delivery" : "Online (Razorpay)"}</dd></div>
              <div><dt className="text-ink-500">Status</dt><dd className="font-semibold text-ink-900">{paymentStatus.replaceAll("_", " ")}</dd></div>
              {voucherRedeemed > 0 && (
                <div><dt className="text-ink-500">Paid with gift card{voucherCode ? ` ${voucherCode}` : ""}</dt><dd className="font-semibold text-green-700">{formatPaise(voucherRedeemed)}</dd></div>
              )}
            </dl>
            <p className="mt-3 text-sm">
              <Link href={`/orders/${orderId}/receipt`} className="font-semibold text-brand-700 hover:underline">
                Receipt / Print →
              </Link>
            </p>
            {paymentMethod === "cod" &&
              (paymentStatus === "cod_pending" || paymentStatus === "partially_paid") &&
              outstandingDue > 0 && (
                <p className="mt-3 text-sm leading-relaxed text-ink-500">
                  Please keep {formatPaise(outstandingDue)} ready — you pay the
                  balance when your laundry is delivered back.
                  {voucherRedeemed > 0
                    ? ` (${formatPaise(voucherRedeemed)} was already covered by your gift card.)`
                    : ""}
                </p>
              )}
            {isDemo && paymentMethod === "razorpay" && paymentStatus !== "paid" && (
              <div className="mt-4">
                <h3 className="font-bold text-ink-900">Retry payment</h3>
                <p className="mt-1 text-sm font-semibold text-amber-900">
                  DEMO MODE — no real payment can be taken here; simulate the payment outcome instead:
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => simulate(true)} className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
                    Simulate success (demo)
                  </button>
                  <button type="button" onClick={() => simulate(false)} className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                    Simulate failure (demo)
                  </button>
                </div>
              </div>
            )}
            {liveRetryEligible && (
              <div className="mt-4">
                <h3 className="font-bold text-ink-900">Retry payment</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">
                  {paymentStatus === "failed"
                    ? "Your last payment attempt did not go through. You can try again — you will only be charged once."
                    : "This order is still waiting for its online payment. You can complete it now."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void retryPayment()}
                    disabled={retryBusy}
                    className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {retryBusy ? "Starting payment…" : "Retry payment"}
                  </button>
                </div>
                {retryNote && (
                  <p
                    role="status"
                    className={`mt-3 text-sm leading-relaxed ${retryNote.kind === "error" ? "font-semibold text-red-600" : "text-ink-700"}`}
                  >
                    {retryNote.text}
                  </p>
                )}
                <div className="mt-4 border-t border-brand-50 pt-4">
                  {hasRazorpayPaymentLink ? (
                    <>
                      <a
                        href={businessSettings.razorpayPaymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block rounded-full border border-brand-600 px-5 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50"
                      >
                        Pay online with Razorpay
                      </a>
                      <p className="mt-2 text-xs leading-relaxed text-ink-500">
                        Opens Razorpay&apos;s secure payment page in a new tab.
                        Pay the order total shown above and keep your order
                        reference handy — we update this order as soon as your
                        payment is confirmed.
                      </p>
                    </>
                  ) : (
                    <>
                      <span
                        aria-disabled="true"
                        className="inline-block cursor-not-allowed rounded-full border border-brand-100 px-5 py-2.5 text-sm font-semibold text-ink-500 opacity-70"
                      >
                        Online payment — setting up soon
                      </span>
                      <p className="mt-2 text-xs leading-relaxed text-ink-500">
                        Our Razorpay payment link is being set up. Pay on
                        Delivery remains fully available for new orders.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
