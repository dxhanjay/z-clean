"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { businessSettings, hasRazorpayPaymentLink } from "@/lib/config";
import { isPaymentRetryEligible } from "@/lib/payment-retry";
import { loadRazorpayScript } from "@/lib/razorpay-checkout";
import OrderTimeline, { type TimelineEvent } from "@/components/OrderTimeline";
import {
  getDemoOrder,
  updateDemoOrder,
  type DemoOrder,
} from "@/lib/demo-store";
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
  history?: TimelineEvent[];
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

function paymentTone(status: string): "brand" | "amber" | "green" | "red" {
  if (status === "paid") return "green";
  if (status === "failed") return "red";
  if (status === "cod_pending") return "amber";
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
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <p className="text-sm text-ink-500">Loading your order…</p>
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
            {paymentMethod === "cod" && paymentStatus === "cod_pending" && (
              <p className="mt-3 text-sm leading-relaxed text-ink-500">
                Please keep {formatPaise(Math.max(0, total - voucherRedeemed))} ready — you pay when your
                laundry is delivered back.
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
