"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { listDemoOrders, type DemoOrder } from "@/lib/demo-store";

/**
 * Dashboard Orders list (Phase 3). Live mode reads /api/orders for the
 * signed-in customer; demo mode reads this browser's demo orders. Each
 * card links to /orders/[id] for the full breakdown. Current status only —
 * the tracking timeline arrives in Phase 4.
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

function OrderCard({
  href,
  title,
  status,
  paymentStatus,
  paymentMethod,
  deliveryType,
  when,
  totalPaise,
  itemCount,
}: {
  href: string;
  title: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryType: string;
  when: string;
  totalPaise: number;
  itemCount: number;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-2xl border border-brand-100 p-5 transition-colors hover:bg-brand-50"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-ink-900">{title}</p>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
            {status.replaceAll("_", " ")}
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-500">
          {itemCount} item line{itemCount === 1 ? "" : "s"} ·{" "}
          {deliveryType === "express" ? "Express" : "Regular"} ·{" "}
          {paymentMethod === "cod" ? "Pay on Delivery" : "Paid online"} (
          {paymentStatus.replaceAll("_", " ")})
        </p>
        <p className="text-sm text-ink-500">Pickup: {when}</p>
        <p className="mt-1 text-sm font-bold text-ink-900">{formatPaise(totalPaise)}</p>
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
    <section aria-labelledby="my-orders" className="mt-10 rounded-2xl border border-brand-100 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="my-orders" className="font-bold text-ink-900">My orders</h2>
        <Link href="/order" className="text-sm font-semibold text-brand-700 hover:underline">
          + New order
        </Link>
      </div>
      {hasOrders ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  totalPaise={o.total_paise}
                  itemCount={o.order_items?.length ?? 0}
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
                  totalPaise={o.totalPaise}
                  itemCount={o.items.length}
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
