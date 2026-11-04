"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { businessSettings } from "@/lib/config";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client";
import { getDemoOrder } from "@/lib/demo-store";
import { demoOrderFinance, listDemoPaymentEntries } from "@/lib/demo-finance";
import { paymentMethodLabel } from "@/lib/finance";

/**
 * Receipt (Phase 9) — a printable bill for one order.
 *
 * Data paths, in order: DEMO MODE reads this browser's demo stores;
 * live mode asks the owner endpoint (/api/orders/[id], RLS-scoped —
 * it carries the Phase 9 finance breakdown); when that refuses (an
 * admin who is not the customer), it composes the same receipt from
 * the admin endpoints instead. Amounts always come from the one
 * finance computation — the receipt can never disagree with the
 * order page or the admin panel.
 *
 * Business name / phone / address come from the settings table when
 * set (public-read), with the src/lib/config.ts values as fallback.
 */

interface ReceiptData {
  orderRef: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  customer: string;
  items: { itemName: string; qty: number; unitPricePaise: number; lineTotalPaise: number }[];
  subtotalPaise: number;
  discountPaise: number;
  voucherDiscountPaise: number;
  voucherCode: string | null;
  deliveryFeePaise: number;
  totalPaise: number;
  payments: { label: string; amountPaise: number; at: string }[];
  refunds: { label: string; amountPaise: number; at: string }[];
  paidPaise: number;
  outstandingPaise: number;
  refundsProcessedPaise: number;
  isDemo: boolean;
}

export default function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [business, setBusiness] = useState<{ phone: string; address: string; email: string }>({
    phone: businessSettings.phone,
    address: businessSettings.address,
    email: businessSettings.email,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Business details from the settings table (public-read).
      if (isSupabaseConfigured()) {
        try {
          const supabase = createClient();
          const { data: rows } = await supabase
            .from("settings")
            .select("key, value")
            .in("key", ["business_phone", "business_address", "business_email"]);
          if (!cancelled && rows) {
            const byKey = new Map(rows.map((r) => [r.key as string, r.value as string | null]));
            setBusiness({
              phone: byKey.get("business_phone")?.trim() || businessSettings.phone,
              address: byKey.get("business_address")?.trim() || businessSettings.address,
              email: byKey.get("business_email")?.trim() || businessSettings.email,
            });
          }
        } catch {
          // Fallbacks stay.
        }
      }
      if (cancelled) return;

      // DEMO MODE.
      if (!isSupabaseConfigured()) {
        const order = getDemoOrder(id);
        if (!order) {
          setState("missing");
          return;
        }
        const finance = demoOrderFinance(order);
        const entries = listDemoPaymentEntries(id);
        setData({
          orderRef: order.id,
          createdAt: order.createdAt,
          status: order.status,
          paymentStatus: order.paymentStatus,
          customer: order.name,
          items: order.items,
          subtotalPaise: order.subtotalPaise,
          discountPaise: order.discountPaise,
          voucherDiscountPaise: 0,
          voucherCode: null,
          deliveryFeePaise: order.deliveryFeePaise,
          totalPaise: order.totalPaise,
          payments: entries
            .filter((e) => e.entryType === "payment")
            .map((e) => ({ label: paymentMethodLabel(e.method), amountPaise: e.amountPaise, at: e.createdAt })),
          refunds: entries
            .filter((e) => e.entryType === "refund")
            .map((e) => ({ label: `Refund (${paymentMethodLabel(e.method)})`, amountPaise: e.amountPaise, at: e.createdAt })),
          paidPaise: finance.effectivePaidPaise,
          outstandingPaise: finance.outstandingPaise,
          refundsProcessedPaise: finance.refundsProcessedPaise,
          isDemo: true,
        });
        setState("ready");
        return;
      }

      // LIVE: owner endpoint first.
      try {
        const res = await fetch(`/api/orders/${id}`);
        const json = await res.json().catch(() => null);
        if (res.ok && json?.mode === "live") {
          const o = json.order;
          setData({
            orderRef: o.id,
            createdAt: o.created_at,
            status: o.status,
            paymentStatus: o.payment_status,
            customer: "Customer",
            items: o.items ?? [],
            subtotalPaise: o.subtotal_paise,
            discountPaise: o.discount_paise,
            voucherDiscountPaise: o.voucher_discount_paise ?? 0,
            voucherCode: o.voucher_code ?? null,
            deliveryFeePaise: o.delivery_fee_paise,
            totalPaise: o.total_paise,
            payments: o.finance?.payments ?? [],
            refunds: o.finance?.refunds ?? [],
            paidPaise: o.finance?.effectivePaidPaise ?? 0,
            outstandingPaise:
              o.finance?.outstandingPaise ?? Math.max(0, o.total_paise - (o.voucher_redeemed_paise ?? 0)),
            refundsProcessedPaise: o.finance?.refundsProcessedPaise ?? 0,
            isDemo: false,
          });
          setState("ready");
          return;
        }
      } catch {
        // Fall through to the admin composition.
      }

      // LIVE: admin composition (admin endpoints are admin-gated).
      try {
        const [orderRes, payRes] = await Promise.all([
          fetch(`/api/admin/orders/${id}`),
          fetch(`/api/admin/orders/${id}/payments`),
        ]);
        const orderJson = await orderRes.json().catch(() => null);
        const payJson = await payRes.json().catch(() => null);
        if (orderRes.ok && payRes.ok && orderJson?.mode === "live" && payJson?.mode === "live") {
          const o = orderJson.order;
          const profile = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;
          const f = payJson.finance;
          setData({
            orderRef: o.id,
            createdAt: o.created_at,
            status: o.status,
            paymentStatus: o.payment_status,
            customer: profile?.name ?? "Customer",
            items: o.items ?? [],
            subtotalPaise: o.subtotal_paise,
            discountPaise: o.discount_paise,
            voucherDiscountPaise: o.voucher_discount_paise ?? 0,
            voucherCode: o.voucher_code ?? null,
            deliveryFeePaise: o.delivery_fee_paise,
            totalPaise: o.total_paise,
            payments: [
              ...(payJson.gatewayPayments ?? [])
                .filter((p: { status: string }) => p.status === "paid")
                .map((p: { gateway: string; amountPaise: number; createdAt: string }) => ({
                  label: p.gateway === "voucher" ? "Gift card" : "Paid online (Razorpay)",
                  amountPaise: p.amountPaise,
                  at: p.createdAt,
                })),
              ...(payJson.entries ?? [])
                .filter((e: { entryType: string }) => e.entryType === "payment")
                .map((e: { method: string; amountPaise: number; createdAt: string }) => ({
                  label: paymentMethodLabel(e.method),
                  amountPaise: e.amountPaise,
                  at: e.createdAt,
                })),
            ],
            refunds: (payJson.entries ?? [])
              .filter((e: { entryType: string }) => e.entryType === "refund")
              .map((e: { method: string; amountPaise: number; createdAt: string }) => ({
                label: `Refund (${paymentMethodLabel(e.method)})`,
                amountPaise: e.amountPaise,
                at: e.createdAt,
              })),
            paidPaise: f.effectivePaidPaise,
            outstandingPaise: f.outstandingPaise,
            refundsProcessedPaise: f.refundsProcessedPaise,
            isDemo: false,
          });
          setState("ready");
          return;
        }
      } catch {
        // Missing below.
      }
      if (!cancelled) setState("missing");
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "loading") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 print:hidden">
        <p className="text-sm text-ink-500">Preparing your receipt…</p>
      </section>
    );
  }
  if (state === "missing" || !data) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 print:hidden">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Receipt not available</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          We could not load this order. Receipts are available to the
          customer who placed the order and to Z-clean admins.
        </p>
        <Link href="/dashboard" className="mt-5 inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700">
          Go to my dashboard
        </Link>
      </section>
    );
  }

  const paidInFull = data.outstandingPaise <= 0 && data.paymentStatus !== "refunded";

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/orders/${id}`} className="text-sm font-semibold text-brand-700 hover:underline">
          ← Back to the order
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-[44px] rounded-full bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Print receipt
        </button>
      </div>

      {data.isDemo && (
        <div role="status" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900 print:hidden">
          DEMO MODE — this receipt is generated from a demo order stored in this browser only.
        </div>
      )}

      <article className="receipt-sheet rounded-2xl border border-brand-100 bg-white p-6 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-100 pb-5">
          <div>
            <p className="text-2xl font-extrabold tracking-tight text-ink-900">{businessSettings.name}</p>
            <p className="mt-0.5 text-sm text-ink-500">{businessSettings.tagline}</p>
            {business.address && <p className="mt-1 text-sm text-ink-500">{business.address}</p>}
            {(business.phone || business.email) && (
              <p className="text-sm text-ink-500">
                {business.phone}
                {business.phone && business.email ? " · " : ""}
                {business.email}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Receipt</p>
            <p className="mt-1 font-bold text-ink-900">
              #{data.orderRef.length > 14 ? `${data.orderRef.slice(0, 8).toUpperCase()}…` : data.orderRef}
            </p>
            <p className="text-sm text-ink-500">
              {new Date(data.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <p className="mt-2 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
              {data.status.replaceAll("_", " ")}
            </p>
          </div>
        </header>

        <p className="mt-4 text-sm text-ink-700">
          Billed to: <span className="font-semibold text-ink-900">{data.customer}</span>
        </p>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="py-2 pr-2 font-bold">Item</th>
              <th className="py-2 pr-2 text-right font-bold">Qty</th>
              <th className="py-2 pr-2 text-right font-bold">Rate</th>
              <th className="py-2 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, idx) => (
              <tr key={idx} className="border-b border-brand-50">
                <td className="py-2.5 pr-2 font-semibold text-ink-900">{item.itemName}</td>
                <td className="py-2.5 pr-2 text-right text-ink-700">{item.qty}</td>
                <td className="py-2.5 pr-2 text-right text-ink-700">{formatPaise(item.unitPricePaise)}</td>
                <td className="py-2.5 text-right font-semibold text-ink-900">{formatPaise(item.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-5 grid max-w-sm gap-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="font-semibold text-ink-900">{formatPaise(data.subtotalPaise)}</dd></div>
          {data.discountPaise > 0 && (
            <div className="flex justify-between"><dt className="text-green-700">Discount</dt><dd className="font-semibold text-green-700">−{formatPaise(data.discountPaise)}</dd></div>
          )}
          {data.voucherDiscountPaise > 0 && (
            <div className="flex justify-between"><dt className="text-green-700">Voucher discount{data.voucherCode ? ` (${data.voucherCode})` : ""}</dt><dd className="font-semibold text-green-700">−{formatPaise(data.voucherDiscountPaise)}</dd></div>
          )}
          <div className="flex justify-between"><dt className="text-ink-500">Pickup &amp; delivery</dt><dd className="font-semibold text-ink-900">{data.deliveryFeePaise === 0 ? "Free" : formatPaise(data.deliveryFeePaise)}</dd></div>
          <div className="flex justify-between border-t border-brand-100 pt-2 text-base"><dt className="font-bold text-ink-900">Total</dt><dd className="font-extrabold text-ink-900">{formatPaise(data.totalPaise)}</dd></div>
        </dl>

        <div className="mt-6 border-t border-brand-100 pt-4">
          <h2 className="text-sm font-bold text-ink-900">Payments</h2>
          {data.payments.length === 0 && data.refunds.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">No payments recorded yet.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5 text-sm">
              {data.payments.map((p, idx) => (
                <li key={`p-${idx}`} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink-700">
                    {p.label}
                    <span className="ml-2 text-xs text-ink-500">{new Date(p.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </span>
                  <span className="font-semibold text-green-700">{formatPaise(p.amountPaise)}</span>
                </li>
              ))}
              {data.refunds.map((r, idx) => (
                <li key={`r-${idx}`} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink-700">
                    {r.label}
                    <span className="ml-2 text-xs text-ink-500">{new Date(r.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </span>
                  <span className="font-semibold text-red-700">−{formatPaise(r.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="ml-auto mt-4 grid max-w-sm gap-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Total paid</dt><dd className="font-semibold text-ink-900">{formatPaise(data.paidPaise)}</dd></div>
            {data.refundsProcessedPaise > 0 && (
              <div className="flex justify-between"><dt className="text-ink-500">Refunded</dt><dd className="font-semibold text-red-700">−{formatPaise(data.refundsProcessedPaise)}</dd></div>
            )}
          </dl>
        </div>

        <div className="mt-6 flex justify-center border-t border-brand-100 pt-5">
          {data.paymentStatus === "refunded" ? (
            <span className="rounded-xl border-2 border-red-300 px-6 py-2 text-lg font-extrabold uppercase tracking-widest text-red-600">
              Refunded
            </span>
          ) : paidInFull ? (
            <span className="rounded-xl border-2 border-green-500 px-6 py-2 text-lg font-extrabold uppercase tracking-widest text-green-700">
              Paid
            </span>
          ) : (
            <span className="rounded-xl border-2 border-amber-400 px-6 py-2 text-base font-extrabold uppercase tracking-widest text-amber-700">
              Balance due {formatPaise(data.outstandingPaise)}
            </span>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ink-500">
          Thank you for choosing {businessSettings.name}. Questions about this bill? Call us
          {business.phone ? ` at ${business.phone}` : ""} with your order reference handy.
        </p>
      </article>
    </section>
  );
}
