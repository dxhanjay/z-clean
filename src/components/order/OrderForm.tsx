"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { orderSchema, PICKUP_SLOTS } from "@/lib/validation";
import {
  DEMO_CITY,
  areasForPincode,
  formatInr,
  formatPaise,
  isPincodeServiceable,
  pricingTerms,
  serviceAreas,
  type PriceGroup,
} from "@/lib/pricing";
import {
  catalogueKey,
  computeOrderTotals,
  type CatalogueEntry,
  type OrderItemInput,
} from "@/lib/totals";
import {
  addDemoOrder,
  listDemoOrders,
  updateDemoOrder,
  type DemoOrder,
} from "@/lib/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { businessSettings, hasRazorpayPaymentLink } from "@/lib/config";
import { loadRazorpayScript } from "@/lib/razorpay-checkout";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

const demoModeDefault = !isSupabaseConfigured();

function todayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

interface VoucherSummary {
  code: string;
  kind: "prepaid_card" | "promo";
  discountPaise: number;
  redeemedPaise: number;
  amountDuePaise: number;
}

type Outcome =
  | { kind: "demo-cod"; order: DemoOrder }
  | { kind: "demo-razorpay"; order: DemoOrder }
  | { kind: "live-cod"; orderId: string; voucher?: VoucherSummary | null }
  | { kind: "live-voucher-paid"; orderId: string; voucher: VoucherSummary | null; finalTotalPaise?: number }
  | { kind: "live-razorpay-unconfigured"; orderId: string }
  | { kind: "live-razorpay-pending"; orderId: string }
  | { kind: "live-razorpay-dismissed"; orderId: string };

/**
 * Order form (client). The catalogue arrives as props from the server
 * page, which loads it DB-first (Phase 7b): in live mode these are the
 * price_items rows the server will re-price from, so the preview total
 * the customer sees is the total the server checks. The static list is
 * the fallback when Supabase is not configured.
 */
export default function OrderForm({
  priceGroups,
  entries,
}: {
  priceGroups: PriceGroup[];
  entries: CatalogueEntry[];
}) {
  const [demoMode] = useState(demoModeDefault);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [deliveryType, setDeliveryType] = useState<"regular" | "express">("regular");
  const [couponCode, setCouponCode] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [pincode, setPincode] = useState("");
  const [demoOrderCount, setDemoOrderCount] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (demoMode) setDemoOrderCount(listDemoOrders().length);
  }, [demoMode]);

  const selectedItems: OrderItemInput[] = useMemo(() => {
    const items: OrderItemInput[] = [];
    for (const group of priceGroups) {
      for (const row of group.items) {
        const qty = quantities[catalogueKey(row.serviceSlug, row.itemName)] ?? 0;
        if (qty > 0) items.push({ serviceSlug: row.serviceSlug, itemName: row.itemName, qty });
      }
    }
    return items;
  }, [quantities]);

  // Live preview uses the SAME engine the server re-checks with, over
  // the catalogue passed in from the server (DB-first). A voucher code
  // is deliberately NOT part of the preview: it is verified and applied
  // on the server at placement, so the preview total is the base total
  // the server integrity-checks.
  const preview = useMemo(() => {
    if (selectedItems.length === 0) return null;
    return computeOrderTotals({
      items: selectedItems,
      deliveryType,
      couponCode: couponCode.trim() ? couponCode : undefined,
      isFirstOrder: demoMode ? demoOrderCount === 0 : true,
      catalogue: entries,
    });
  }, [selectedItems, deliveryType, couponCode, demoMode, demoOrderCount, entries]);

  const pincodeValid = /^\d{6}$/.test(pincode);
  const pincodeServiceable = pincodeValid && isPincodeServiceable(pincode);
  const areaOptions = useMemo(
    () => (pincodeServiceable ? areasForPincode(pincode) : serviceAreas),
    [pincode, pincodeServiceable],
  );

  function setQty(key: string, raw: string) {
    const value = Number(raw);
    setQuantities((prev) => ({
      ...prev,
      [key]: Number.isFinite(value) && value > 0 ? value : 0,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    if (!preview) {
      setFormError("Add at least one item to your order.");
      return;
    }
    if (!preview.ok) {
      setFormError(preview.error);
      return;
    }

    const payload = {
      name: form.get("name"),
      phone: form.get("phone"),
      addressLine: form.get("addressLine"),
      area: form.get("area"),
      city: form.get("city"),
      pincode: form.get("pincode"),
      pickupDate: form.get("pickupDate"),
      pickupSlot: form.get("pickupSlot"),
      deliveryType,
      note: form.get("note") ?? "",
      items: selectedItems,
      paymentMethod: form.get("paymentMethod"),
      couponCode: couponCode.trim(),
      voucherCode: voucherCode.trim(),
      expectedTotalPaise: preview.totalPaise,
    };

    const parsed = orderSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setFormError("");
      return;
    }
    if (!isPincodeServiceable(parsed.data.pincode)) {
      setErrors({ pincode: "Not serviceable yet — we serve Bokaro Steel City pincodes 827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014 and 829301." });
      return;
    }

    setErrors({});
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = (await res.json().catch(() => ({}))) as {
        mode?: string;
        orderId?: string;
        error?: string;
        code?: string;
        fieldErrors?: Record<string, string>;
        paymentStatus?: string;
        voucher?: VoucherSummary | null;
        finalTotalPaise?: number;
        payment?: {
          gatewayConfigured?: boolean;
          gatewayOrderId?: string;
          amountPaise?: number;
          keyId?: string;
        };
      };

      if (res.status === 503 && json.mode === "demo") {
        // DEMO MODE: no database configured — keep the order in this
        // browser and label everything DEMO. Payments below are explicit
        // simulations, never real charges.
        const order = addDemoOrder({
          name: parsed.data.name,
          phone: parsed.data.phone,
          addressLine: parsed.data.addressLine,
          area: parsed.data.area,
          city: parsed.data.city,
          pincode: parsed.data.pincode,
          pickupDate: parsed.data.pickupDate,
          pickupSlot: parsed.data.pickupSlot,
          deliveryType: parsed.data.deliveryType,
          note: parsed.data.note || undefined,
          items: preview.lines.map((l) => ({
            serviceSlug: l.serviceSlug,
            itemName: l.itemName,
            qty: l.qty,
            unitLabel: l.unitLabel,
            unitPricePaise: l.unitPricePaise,
            lineTotalPaise: l.lineTotalPaise,
          })),
          couponCode: preview.couponApplied ?? undefined,
          subtotalPaise: preview.subtotalPaise,
          discountPaise: preview.discountPaise,
          deliveryFeePaise: preview.deliveryFeePaise,
          totalPaise: preview.totalPaise,
          paymentMethod: parsed.data.paymentMethod,
          paymentStatus: parsed.data.paymentMethod === "cod" ? "cod_pending" : "pending",
          status: parsed.data.paymentMethod === "cod" ? "PICKUP_SCHEDULED" : "PAYMENT_PENDING",
        });
        setOutcome(
          parsed.data.paymentMethod === "cod"
            ? { kind: "demo-cod", order }
            : { kind: "demo-razorpay", order },
        );
        return;
      }

      if (!res.ok) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        if (res.status === 401) {
          setFormError("Please sign in to place an order — then come back and your items will still be here in this tab.");
        } else {
          setFormError(json.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      const orderId = json.orderId ?? "";
      // A gift card (or a 100% promo) can settle the whole order on the
      // server — no payment step remains, whatever method was picked.
      if (json.paymentStatus === "paid") {
        setOutcome({
          kind: "live-voucher-paid",
          orderId,
          voucher: json.voucher ?? null,
          finalTotalPaise: json.finalTotalPaise,
        });
        return;
      }
      if (parsed.data.paymentMethod === "cod") {
        setOutcome({ kind: "live-cod", orderId, voucher: json.voucher ?? null });
        return;
      }
      if (!json.payment?.gatewayConfigured || !json.payment.gatewayOrderId || !json.payment.keyId) {
        setOutcome({ kind: "live-razorpay-unconfigured", orderId });
        return;
      }

      // Razorpay Checkout (live/test keys). IMPORTANT: the handler here is
      // cosmetic — the order is only marked PAID by the verified webhook.
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setOutcome({ kind: "live-razorpay-unconfigured", orderId });
        return;
      }
      const rzp = new window.Razorpay({
        key: json.payment.keyId,
        amount: json.payment.amountPaise ?? preview.totalPaise,
        currency: "INR",
        name: "Z-clean",
        description: "Laundry & dry cleaning order",
        order_id: json.payment.gatewayOrderId,
        prefill: { name: parsed.data.name, contact: parsed.data.phone },
        handler: () => setOutcome({ kind: "live-razorpay-pending", orderId }),
        modal: { ondismiss: () => setOutcome({ kind: "live-razorpay-dismissed", orderId }) },
        theme: { color: "#0f766e" },
      });
      rzp.open();
    } catch {
      setFormError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function simulatePayment(order: DemoOrder, success: boolean) {
    const updated = updateDemoOrder(
      order.id,
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
    if (updated) setOutcome({ kind: "demo-razorpay", order: updated });
  }

  if (outcome) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div role="status" className="rounded-2xl border border-brand-200 bg-white p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
            {outcome.kind.includes("cod") || outcome.kind === "live-voucher-paid"
              ? "Order placed"
              : "Order placed — payment step"}
          </h1>

          {outcome.kind === "demo-cod" && (
            <>
              <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                <strong>DEMO MODE:</strong> this order (demo reference{" "}
                <strong>{outcome.order.id}</strong>) is saved only in this
                browser. No real order has been placed. You chose Pay on
                Delivery — in the real service you would pay{" "}
                <strong>{formatPaise(outcome.order.totalPaise)}</strong> when
                your laundry is delivered back.
              </div>
              <OrderLinks demoId={outcome.order.id} />
            </>
          )}

          {outcome.kind === "demo-razorpay" && (
            <>
              <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                <strong>DEMO MODE:</strong> Razorpay is not connected on this
                demo, so no real payment can be taken. Use the simulation
                buttons below to see how the order behaves — a simulation is
                never a real charge. Demo order{" "}
                <strong>{outcome.order.id}</strong> · total{" "}
                <strong>{formatPaise(outcome.order.totalPaise)}</strong> ·
                payment status:{" "}
                <strong>{outcome.order.paymentStatus.replaceAll("_", " ")}</strong>
              </div>
              {outcome.order.paymentStatus === "pending" && (
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => simulatePayment(outcome.order, true)}
                    className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
                  >
                    Simulate payment success (demo)
                  </button>
                  <button
                    type="button"
                    onClick={() => simulatePayment(outcome.order, false)}
                    className="rounded-full border border-red-200 px-6 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Simulate payment failure (demo)
                  </button>
                </div>
              )}
              {outcome.order.paymentStatus === "paid" && (
                <p className="mt-4 text-sm font-semibold text-green-700">
                  Simulated payment succeeded — pickup is scheduled. (Demo only; nothing was charged.)
                </p>
              )}
              {outcome.order.paymentStatus === "failed" && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-red-600">
                    Simulated payment failed. In the real service you could retry payment or switch to Pay on Delivery.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => simulatePayment(outcome.order, true)}
                      className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
                    >
                      Simulate payment success instead (demo)
                    </button>
                  </div>
                </div>
              )}
              <OrderLinks demoId={outcome.order.id} />
            </>
          )}

          {outcome.kind === "live-cod" && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Your order <strong>{outcome.orderId}</strong> is placed and
                your pickup is scheduled. Please keep the payment ready in
                cash / UPI — you pay when your laundry is delivered back.
              </p>
              {outcome.voucher && outcome.voucher.redeemedPaise > 0 && (
                <p className="mt-2 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
                  Gift card {outcome.voucher.code} covered{" "}
                  {formatPaise(outcome.voucher.redeemedPaise)} —{" "}
                  {formatPaise(outcome.voucher.amountDuePaise)} left to pay
                  on delivery.
                </p>
              )}
              <OrderLinks liveId={outcome.orderId} />
            </>
          )}

          {outcome.kind === "live-voucher-paid" && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Your order <strong>{outcome.orderId}</strong> is placed,
                your pickup is scheduled, and it is{" "}
                <strong>paid in full</strong>
                {outcome.finalTotalPaise !== undefined
                  ? ` (${formatPaise(outcome.finalTotalPaise)})`
                  : ""}
                {outcome.voucher
                  ? outcome.voucher.kind === "prepaid_card"
                    ? ` with gift card ${outcome.voucher.code}. Nothing more to pay.`
                    : ` after voucher ${outcome.voucher.code} was applied. Nothing more to pay.`
                  : "."}
              </p>
              <OrderLinks liveId={outcome.orderId} />
            </>
          )}

          {outcome.kind === "live-razorpay-unconfigured" && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Your order <strong>{outcome.orderId}</strong> is saved as
                payment pending, but online payment is not available right
                now. Our team will contact you to complete it — or place a
                new order with Pay on Delivery.
              </p>
              <PaymentLinkCta />
              <OrderLinks liveId={outcome.orderId} />
            </>
          )}

          {outcome.kind === "live-razorpay-pending" && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Payment submitted for order <strong>{outcome.orderId}</strong>.
                We confirm every payment with Razorpay on our server before
                marking an order paid — your order page will update as soon
                as that confirmation arrives.
              </p>
              <OrderLinks liveId={outcome.orderId} />
            </>
          )}

          {outcome.kind === "live-razorpay-dismissed" && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                The payment window was closed, so order{" "}
                <strong>{outcome.orderId}</strong> is saved as payment
                pending. You can retry the payment from the order page —
                nothing has been charged.
              </p>
              <PaymentLinkCta />
              <OrderLinks liveId={outcome.orderId} />
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
        Place an order
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
        Pick your items, tell us where to collect them, and pay online or on
        delivery. Prices are the approved {DEMO_CITY} list — minimum order{" "}
        {formatInr(pricingTerms.minimumOrderInr)}, free pickup &amp; delivery
        from {formatInr(pricingTerms.freeDeliveryThresholdInr)} after any
        discount.
      </p>

      {demoMode && (
        <div role="status" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          DEMO MODE — this demo is not connected to a live booking or payment
          system. Orders are saved in your browser only, and “payments” are
          explicit simulations. No real order or charge happens here.
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-8">
          <fieldset>
            <legend className="text-lg font-extrabold tracking-tight text-ink-900">1 · Your items</legend>
            <div className="mt-4 grid gap-6">
              {priceGroups.map((group) => (
                <div key={group.title} className="rounded-2xl border border-brand-100 p-5">
                  <h2 className="font-bold text-ink-900">{group.title}</h2>
                  <p className="mt-0.5 text-xs text-ink-500">{group.unitNote}</p>
                  <ul className="mt-3 divide-y divide-brand-50">
                    {group.items.map((row) => {
                      const key = catalogueKey(row.serviceSlug, row.itemName);
                      const qty = quantities[key] ?? 0;
                      const step = row.unitLabel === "per kg" || row.unitLabel === "per sq ft" ? 0.5 : 1;
                      return (
                        <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-ink-900">{row.itemName}</p>
                            <p className="text-xs text-ink-500">
                              {formatInr(row.priceInr)} {row.unitLabel}
                              {deliveryType === "express" && qty > 0 ? " · express rate applies" : ""}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-ink-700">
                            <span className="sr-only">Quantity for {row.itemName}</span>
                            <input
                              type="number"
                              min={0}
                              step={step}
                              value={qty || ""}
                              placeholder="0"
                              onChange={(e) => setQty(key, e.target.value)}
                              className="w-24 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                            />
                            <span className="text-xs text-ink-500">{row.unitLabel.replace("per ", "")}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-lg font-extrabold tracking-tight text-ink-900">2 · Pickup details</legend>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className={labelClass}>Full name</label>
                <input id="name" name="name" autoComplete="name" className={inputClass} aria-invalid={!!errors.name} />
                {errors.name && <p role="alert" className="mt-1 text-sm text-red-600">{errors.name}</p>}
              </div>
              <div>
                <label htmlFor="phone" className={labelClass}>Mobile number</label>
                <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="10-digit mobile" className={inputClass} aria-invalid={!!errors.phone} />
                {errors.phone && <p role="alert" className="mt-1 text-sm text-red-600">{errors.phone}</p>}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="addressLine" className={labelClass}>Pickup address</label>
                <input id="addressLine" name="addressLine" autoComplete="street-address" placeholder="House / quarter no., street, landmark" className={inputClass} aria-invalid={!!errors.addressLine} />
                {errors.addressLine && <p role="alert" className="mt-1 text-sm text-red-600">{errors.addressLine}</p>}
              </div>
              <div>
                <label htmlFor="pincode" className={labelClass}>Pincode</label>
                <input
                  id="pincode"
                  name="pincode"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="e.g. 827004"
                  className={inputClass}
                  aria-invalid={!!errors.pincode}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                />
                {pincodeValid && !pincodeServiceable && (
                  <p role="alert" className="mt-1 text-sm font-semibold text-red-600">
                    Sorry — this pincode is not serviceable yet. We currently serve 827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014 and 829301 in Bokaro Steel City.
                  </p>
                )}
                {pincodeServiceable && <p className="mt-1 text-sm font-semibold text-green-700">Good news — we serve this pincode.</p>}
                {errors.pincode && <p role="alert" className="mt-1 text-sm text-red-600">{errors.pincode}</p>}
              </div>
              <div>
                <label htmlFor="area" className={labelClass}>Area</label>
                <select id="area" name="area" className={inputClass} aria-invalid={!!errors.area} defaultValue="">
                  <option value="" disabled>Select your area</option>
                  {areaOptions.map((a) => (
                    <option key={`${a.area}-${a.pincode}`} value={a.area}>{a.area} ({a.pincode})</option>
                  ))}
                </select>
                {errors.area && <p role="alert" className="mt-1 text-sm text-red-600">{errors.area}</p>}
              </div>
              <div>
                <label htmlFor="city" className={labelClass}>City</label>
                <input id="city" name="city" defaultValue={DEMO_CITY} className={inputClass} aria-invalid={!!errors.city} />
                {errors.city && <p role="alert" className="mt-1 text-sm text-red-600">{errors.city}</p>}
              </div>
              <div>
                <label htmlFor="pickupDate" className={labelClass}>Pickup date</label>
                <input id="pickupDate" name="pickupDate" type="date" min={todayStr()} className={inputClass} aria-invalid={!!errors.pickupDate} />
                {errors.pickupDate && <p role="alert" className="mt-1 text-sm text-red-600">{errors.pickupDate}</p>}
              </div>
              <div>
                <label htmlFor="pickupSlot" className={labelClass}>Pickup time slot</label>
                <select id="pickupSlot" name="pickupSlot" className={inputClass} aria-invalid={!!errors.pickupSlot} defaultValue="">
                  <option value="" disabled>Select a slot</option>
                  {PICKUP_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
                {errors.pickupSlot && <p role="alert" className="mt-1 text-sm text-red-600">{errors.pickupSlot}</p>}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="note" className={labelClass}>
                  Note <span className="font-normal text-ink-500">(optional — gate, landmark, special care)</span>
                </label>
                <textarea id="note" name="note" rows={2} maxLength={500} className={inputClass} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-lg font-extrabold tracking-tight text-ink-900">3 · Delivery speed &amp; payment</legend>
            <div className="mt-4 flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm text-ink-700">
                <input type="radio" name="deliveryTypeUi" checked={deliveryType === "regular"} onChange={() => setDeliveryType("regular")} />
                Regular — standard prices
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm text-ink-700">
                <input type="radio" name="deliveryTypeUi" checked={deliveryType === "express"} onChange={() => setDeliveryType("express")} />
                Express — same/next day at {pricingTerms.expressMultiplier}×
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm text-ink-700">
                <input type="radio" name="paymentMethod" value="razorpay" defaultChecked />
                Pay online (Razorpay — UPI / cards / netbanking)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm text-ink-700">
                <input type="radio" name="paymentMethod" value="cod" />
                Pay on Delivery (cash / UPI at delivery)
              </label>
            </div>
            {!demoMode && (
              <div className="mt-3">
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
                      You can pay now and then place your order here, or pay
                      from your order page afterwards — keep your order
                      reference handy either way.
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
                      Delivery is fully available.
                    </p>
                  </>
                )}
              </div>
            )}
          </fieldset>
        </div>

        <aside className="rounded-2xl border border-brand-100 bg-white p-6 lg:sticky lg:top-6">
          <h2 className="font-extrabold tracking-tight text-ink-900">Order summary</h2>
          {preview === null && (
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              Add items to see your total. Nothing is charged until you place
              the order — and final weight/count is always confirmed at pickup.
            </p>
          )}
          {preview && !preview.ok && (
            <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{preview.error}</p>
          )}
          {preview?.ok && (
            <>
              <ul className="mt-4 grid gap-2 text-sm">
                {preview.lines.map((line) => (
                  <li key={`${line.serviceSlug}-${line.itemName}`} className="flex justify-between gap-3">
                    <span className="text-ink-700">
                      {line.itemName} <span className="text-ink-500">× {line.qty} ({line.unitLabel.replace("per ", "")})</span>
                    </span>
                    <span className="font-semibold text-ink-900">{formatPaise(line.lineTotalPaise)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 grid gap-1.5 border-t border-brand-50 pt-4 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd className="font-semibold text-ink-900">{formatPaise(preview.subtotalPaise)}</dd></div>
                {preview.discountPaise > 0 && (
                  <div className="flex justify-between"><dt className="text-green-700">Discount ({preview.couponApplied})</dt><dd className="font-semibold text-green-700">−{formatPaise(preview.discountPaise)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-ink-500">Pickup &amp; delivery</dt><dd className="font-semibold text-ink-900">{preview.deliveryFeePaise === 0 ? "Free" : formatPaise(preview.deliveryFeePaise)}</dd></div>
                <div className="flex justify-between border-t border-brand-50 pt-2 text-base"><dt className="font-bold text-ink-900">Total</dt><dd className="font-extrabold text-ink-900">{formatPaise(preview.totalPaise)}</dd></div>
              </dl>
            </>
          )}

          <div className="mt-5">
            <label htmlFor="coupon" className={labelClass}>
              Coupon <span className="font-normal text-ink-500">(first order? try {pricingTerms.firstOrderCoupon.code})</span>
            </label>
            <input
              id="coupon"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="FIRST20"
              className={`${inputClass} mt-1.5 uppercase`}
            />
            {preview?.ok && preview.couponApplied && (
              <p className="mt-1.5 text-sm font-semibold text-green-700">{preview.couponApplied} applied — 20% off.</p>
            )}
          </div>

          <div className="mt-5">
            <label htmlFor="voucher" className={labelClass}>
              Gift voucher / gift card <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <input
              id="voucher"
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
              placeholder="ZCGIFT-XXXXXXXX"
              className={`${inputClass} mt-1.5 uppercase`}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              Have a Z-clean gift card or promo voucher? Enter the code —
              it is verified on our server when you place the order, so
              the discount or card payment is applied then, not in the
              preview above. A voucher and a coupon cannot be combined.
              {demoMode
                ? " In demo mode vouchers are not checked — no discount is simulated."
                : ""}
            </p>
          </div>

          {formError && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{formError}</p>}
          {errors.items && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{errors.items}</p>}

          <button
            type="submit"
            disabled={submitting || !preview?.ok}
            className="mt-5 w-full rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Placing order…" : demoMode ? "Place order (demo)" : "Place order"}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Online payments are confirmed on our server via Razorpay before an
            order is marked paid — the payment window alone never marks it paid.
          </p>
        </aside>
      </form>
    </section>
  );
}

/**
 * Interim online-payment path while the full Razorpay gateway setup is
 * deferred (owner decision 2026-11-04): the owner's Razorpay Payment
 * Link when one is configured, otherwise a disabled "setting up soon"
 * stand-in. Pay on Delivery is unaffected either way.
 */
function PaymentLinkCta() {
  if (hasRazorpayPaymentLink) {
    return (
      <div className="mt-4">
        <a
          href={businessSettings.razorpayPaymentLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
        >
          Pay online with Razorpay
        </a>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Opens Razorpay&apos;s secure payment page in a new tab. Keep your
          order reference handy — we update your order once the payment is
          confirmed.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4">
      <span
        aria-disabled="true"
        className="inline-block cursor-not-allowed rounded-full border border-brand-100 px-6 py-3 text-sm font-semibold text-ink-500 opacity-70"
      >
        Online payment — setting up soon
      </span>
    </div>
  );
}

function OrderLinks({ demoId, liveId }: { demoId?: string; liveId?: string }) {
  const id = demoId ?? liveId ?? "";
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href={`/orders/${id}`}
        className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
      >
        View this order
      </Link>
      <Link
        href="/dashboard"
        className="rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-ink-700 hover:bg-brand-50"
      >
        Go to my dashboard
      </Link>
    </div>
  );
}
