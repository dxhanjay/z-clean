"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { ALL_ORDER_STATUSES, statusLabel } from "@/lib/order-flow";
import {
  listDemoOrders,
  listDemoPickups,
} from "@/lib/demo-store";

/**
 * Admin order queue (Phase 4).
 *
 * Live mode reads GET /api/admin/orders (server verifies the admin role;
 * admin RLS returns every order) and demo mode reads this browser's demo
 * store — the layout banner makes clear which world you are in.
 *
 * Filters: order status, payment method, payment status, and a search
 * over order id / customer name / phone. Pickup requests (Phase 2) are
 * listed below the orders.
 */

interface QueueOrder {
  id: string;
  title: string;
  customer: string;
  phone: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryType: string;
  totalPaise: number;
  itemCount: number;
  when: string;
  createdAt: string;
}

interface QueuePickup {
  id: string;
  name: string;
  phone: string;
  areaLine: string;
  services: string[];
  when: string;
  status: string;
  deliveryType: string;
}

interface LiveOrderRow {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_type: string;
  pickup_slot: string;
  total_paise: number;
  created_at: string;
  profiles: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
  order_items: { qty: number }[];
}

interface LivePickupRow {
  id: string;
  name: string;
  phone: string;
  address_line: string;
  area: string | null;
  city: string;
  pincode: string;
  services: string[];
  pickup_slot: string;
  delivery_type: string;
  status: string;
}

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const selectClass =
  "min-h-[44px] w-full rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 lg:w-auto";

export default function AdminQueue({ mode }: { mode: "live" | "demo" }) {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [pickups, setPickups] = useState<QueuePickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (mode === "live") {
        try {
          const res = await fetch("/api/admin/orders");
          const json = await res.json().catch(() => null);
          if (!res.ok || !json || json.mode !== "live") {
            if (!cancelled) {
              setLoadError(json?.error ?? "Could not load the order queue.");
              setLoading(false);
            }
            return;
          }
          if (cancelled) return;
          setOrders(
            (json.orders as LiveOrderRow[]).map((o) => {
              const profile = first(o.profiles);
              return {
                id: o.id,
                title: `Order ${o.id.slice(0, 8).toUpperCase()}`,
                customer: profile?.name ?? "Customer",
                phone: profile?.phone ?? "",
                status: o.status,
                paymentStatus: o.payment_status,
                paymentMethod: o.payment_method,
                deliveryType: o.delivery_type,
                totalPaise: o.total_paise,
                itemCount: o.order_items?.length ?? 0,
                when: new Date(o.pickup_slot).toLocaleString("en-IN"),
                createdAt: o.created_at,
              };
            }),
          );
          setPickups(
            (json.pickups as LivePickupRow[]).map((p) => ({
              id: p.id,
              name: p.name,
              phone: p.phone,
              areaLine: `${p.area ?? ""}, ${p.city} — ${p.pincode}`,
              services: p.services ?? [],
              when: new Date(p.pickup_slot).toLocaleString("en-IN"),
              status: p.status,
              deliveryType: p.delivery_type,
            })),
          );
        } catch {
          if (!cancelled) setLoadError("Could not load the order queue.");
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      // Demo mode: this browser's demo store.
      setOrders(
        listDemoOrders().map((o) => ({
          id: o.id,
          title: `Demo order ${o.id}`,
          customer: o.name,
          phone: o.phone,
          status: o.status,
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod,
          deliveryType: o.deliveryType,
          totalPaise: o.totalPaise,
          itemCount: o.items.length,
          when: `${o.pickupDate} · ${o.pickupSlot}`,
          createdAt: o.createdAt,
        })),
      );
      setPickups(
        listDemoPickups().map((p) => ({
          id: p.ref,
          name: p.name,
          phone: p.phone,
          areaLine: `${p.area}, ${p.city} — ${p.pincode}`,
          services: p.services,
          when: `${p.pickupDate} · ${p.pickupSlot}`,
          status: p.status,
          deliveryType: p.deliveryType,
        })),
      );
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (methodFilter !== "ALL" && o.paymentMethod !== methodFilter) return false;
      if (paymentFilter !== "ALL" && o.paymentStatus !== paymentFilter) return false;
      if (q) {
        const hay = `${o.id} ${o.title} ${o.customer} ${o.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, methodFilter, paymentFilter, search]);

  return (
    <div className="mt-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <label className="sr-only" htmlFor="admin-search">Search orders</label>
        <input
          id="admin-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order id, name or phone…"
          className="min-h-[44px] w-full rounded-full border border-brand-200 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none sm:col-span-2 lg:w-auto lg:flex-1"
        />
        <label className="sr-only" htmlFor="admin-status">Filter by status</label>
        <select id="admin-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="ALL">All statuses</option>
          {ALL_ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="admin-method">Filter by payment method</label>
        <select id="admin-method" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className={selectClass}>
          <option value="ALL">Any method</option>
          <option value="razorpay">Online (Razorpay)</option>
          <option value="cod">Pay on Delivery</option>
        </select>
        <label className="sr-only" htmlFor="admin-payment">Filter by payment status</label>
        <select id="admin-payment" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className={selectClass}>
          <option value="ALL">Any payment status</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partially paid</option>
          <option value="cod_pending">COD pending</option>
          <option value="pending">Payment pending</option>
          <option value="failed">Payment failed</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {loadError && (
        <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {loadError}
        </p>
      )}

      <h2 className="mt-8 font-bold text-ink-900">
        Orders {loading ? "" : `(${filtered.length}${filtered.length !== orders.length ? ` of ${orders.length}` : ""})`}
      </h2>
      {loading ? (
        <p className="mt-3 text-sm text-ink-500">Loading orders…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          {orders.length === 0
            ? mode === "demo"
              ? "No demo orders in this browser yet. Place a demo order from the Order page and it will appear here."
              : "No orders yet."
            : "No orders match the current filters."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {filtered.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/orders/${o.id}`}
                className="block rounded-2xl border border-brand-100 p-4 transition-colors hover:bg-brand-50 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-ink-900">{o.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                      {o.status.replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                      {o.paymentMethod === "cod" ? "COD" : "Online"} · {o.paymentStatus.replaceAll("_", " ")}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  {o.customer}
                  {o.phone ? ` · ${o.phone}` : ""} · {o.itemCount} item line
                  {o.itemCount === 1 ? "" : "s"} · {o.deliveryType === "express" ? "Express" : "Regular"}
                </p>
                <p className="text-sm text-ink-500">Pickup: {o.when}</p>
                <p className="mt-1 text-sm font-bold text-ink-900">{formatPaise(o.totalPaise)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 font-bold text-ink-900">Pickup requests ({pickups.length})</h2>
      {pickups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          {mode === "demo"
            ? "No demo pickup requests in this browser yet."
            : "No pickup requests yet."}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {pickups.map((p) => (
            <li key={p.id} className="rounded-2xl border border-brand-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-ink-900">{p.name}</p>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                  {p.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-500">{p.phone} · {p.areaLine}</p>
              <p className="break-words text-sm text-ink-500">
                {p.services.length ? p.services.join(", ") : "Laundry"} ·{" "}
                {p.deliveryType === "express" ? "Express" : "Regular"}
              </p>
              <p className="text-sm text-ink-500">Pickup: {p.when}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
