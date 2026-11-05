"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { aboutImages } from "@/lib/media";
import { listDemoOrders, type DemoOrder } from "@/lib/demo-store";

/**
 * Dashboard Orders list (Phase 3; Phase A garment-card restyle).
 * Live mode reads /api/orders for the signed-in customer; demo mode
 * reads this browser's demo orders. Each card links to /orders/[id]
 * for the full breakdown. The card visual is the site's folded-
 * laundry photo (decorative — the list API carries item counts, not
 * per-item photos); everything else on the card is the order's real
 * data: reference, status, item quantities, dates and total.
 */

interface LiveOrderRow {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_type: string;
  pickup_slot: string;
  total_paise: number;
  created_at: string;
  order_items: { qty: number }[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function OrderCard({
  href,
  title,
  status,
  paymentStatus,
  paymentMethod,
  deliveryType,
  when,
  orderDate,
  totalPaise,
  itemCount,
  totalQty,
}: {
  href: string;
  title: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryType: string;
  when: string;
  orderDate: string;
  totalPaise: number;
  itemCount: number;
  totalQty: number;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group block overflow-hidden rounded-[2rem] bg-white shadow-soft ring-1 ring-mist-200/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg"
      >
        <div className="relative overflow-hidden">
          <img
            src={aboutImages[2].src}
            alt=""
            loading="lazy"
            className="h-32 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
          <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-brand-700 shadow-soft-sm backdrop-blur">
            {status.replaceAll("_", " ")}
          </span>
        </div>
        <div className="p-5">
          <p className="font-bold text-ink-900">{title}</p>
          <p className="mt-1.5 text-sm text-ink-500">
            {totalQty} item{totalQty === 1 ? "" : "s"} in {itemCount} line
            {itemCount === 1 ? "" : "s"} ·{" "}
            {deliveryType === "express" ? "Express" : "Regular"} ·{" "}
            {paymentMethod === "cod" ? "Pay on Delivery" : "Paid online"} (
            {paymentStatus.replaceAll("_", " ")})
          </p>
          <p className="text-sm text-ink-500">Pickup: {when}</p>
          <p className="mt-3 flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              {orderDate}
            </span>
            <span className="text-base font-extrabold text-ink-900">
              {formatPaise(totalPaise)}
            </span>
          </p>
        </div>
      </Link>
    </li>
  );
}

export default function OrdersSection({
  mode,
  signedIn,
}: {
  mode: "live" | "demo";
  signedIn: boolean;
}) {
  const [liveOrders, setLiveOrders] = useState<LiveOrderRow[]>([]);
  const [demoOrders, setDemoOrders] = useState<DemoOrder[]>([]);

  useEffect(() => {
    if (mode === "live" && signedIn) {
      fetch("/api/orders")
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.orders) setLiveOrders(json.orders as LiveOrderRow[]);
        })
        .catch(() => undefined);
    } else {
      setDemoOrders(listDemoOrders());
    }
  }, [mode, signedIn]);

  const hasOrders = mode === "live" ? liveOrders.length > 0 : demoOrders.length > 0;

  return (
    <section aria-labelledby="my-orders" className="mt-10 rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
      <div className="flex items-center justify-between gap-3">
        <h2 id="my-orders" className="font-bold text-ink-900">My orders</h2>
        <Link href="/order" className="text-sm font-semibold text-brand-700 hover:underline">
          + New order
        </Link>
      </div>
      {hasOrders ? (
        <ul className="mt-5 grid gap-5 sm:grid-cols-2">
          {mode === "live"
            ? liveOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  href={`/orders/${o.id}`}
                  title={`Order ${o.id.slice(0, 8).toUpperCase()}`}
                  status={o.status}
                  paymentStatus={o.payment_status}
                  paymentMethod={o.payment_method}
                  deliveryType={o.delivery_type}
                  when={new Date(o.pickup_slot).toLocaleString("en-IN")}
                  orderDate={formatDate(o.created_at)}
                  totalPaise={o.total_paise}
                  itemCount={o.order_items?.length ?? 0}
                  totalQty={(o.order_items ?? []).reduce((sum, i) => sum + i.qty, 0)}
                />
              ))
            : demoOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  href={`/orders/${o.id}`}
                  title={`Demo order ${o.id}`}
                  status={o.status}
                  paymentStatus={o.paymentStatus}
                  paymentMethod={o.paymentMethod}
                  deliveryType={o.deliveryType}
                  when={`${o.pickupDate} · ${o.pickupSlot}`}
                  orderDate={formatDate(o.createdAt)}
                  totalPaise={o.totalPaise}
                  itemCount={o.items.length}
                  totalQty={o.items.reduce((sum, i) => sum + i.qty, 0)}
                />
              ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          No orders yet.{" "}
          <Link href="/order" className="font-semibold text-brand-700 hover:underline">
            Place your first order
          </Link>{" "}
          and it will appear here with its payment and pickup status.
        </p>
      )}
    </section>
  );
}
