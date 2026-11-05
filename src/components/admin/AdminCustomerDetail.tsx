"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { roleLabel } from "@/lib/roles";
import { statusLabel } from "@/lib/order-flow";
import { SkeletonText } from "@/components/Skeleton";
import { groupDemoCustomers } from "@/lib/demo-customers";

/**
 * Customer detail (Delta 1) — profile, addresses, recent orders,
 * active vouchers, money totals, and (admin tier and up) the
 * disable/enable switch. Disabling never deletes anything and never
 * blocks sign-in: the customer keeps their history and support
 * access, but POST /api/orders and POST /api/pickups refuse new
 * business with 403 ACCOUNT_DISABLED. Demo mode shows the grouped
 * demo orders for the phone and no switch (demo has no accounts).
 */

interface CustomerDetail {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  disabled: boolean;
  createdAt: string;
  ordersCount: number;
  lifetimeSpendPaise: number;
  outstandingPaise: number;
  lastOrderAt: string | null;
}

interface AddressRow {
  id: string;
  label: string;
  line: string;
  area: string | null;
  city: string;
  pincode: string;
}

interface OrderRow {
  id: string;
  status: string;
  paymentStatus: string;
  totalPaise: number;
  itemCount: number;
  createdAt: string;
}

interface VoucherRow {
  id: string;
  code: string;
  kind: string;
  status: string;
  balancePaise: number | null;
  validUntil: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-admin-border bg-white p-5">
      <h2 className="mb-4 border-b border-admin-border pb-3 text-[15px] font-bold tracking-tight text-admin-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AdminCustomerDetail({
  mode,
  customerId,
  canManage,
}: {
  mode: "live" | "demo";
  customerId: string;
  /** Admin tier or above — controls the disable/enable switch. */
  canManage: boolean;
}) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      if (mode === "demo") {
        const found = groupDemoCustomers().find((c) => c.id === customerId);
        if (!found) throw new Error("Customer not found in the demo orders.");
        setCustomer({
          id: found.id,
          name: found.name,
          email: null,
          phone: found.phone,
          role: "customer",
          disabled: false,
          createdAt: found.createdAt,
          ordersCount: found.ordersCount,
          lifetimeSpendPaise: found.lifetimeSpendPaise,
          outstandingPaise: found.outstandingPaise,
          lastOrderAt: found.lastOrderAt,
        });
        setAddresses(
          found.orders.slice(0, 1).map((o) => ({
            id: o.id,
            label: "Order address",
            line: o.addressLine,
            area: o.area,
            city: o.city,
            pincode: o.pincode,
          })),
        );
        setOrders(
          found.orders.slice(0, 20).map((o) => ({
            id: o.id,
            status: o.status,
            paymentStatus: o.paymentStatus,
            totalPaise: o.totalPaise,
            itemCount: o.items.reduce((s, i) => s + i.qty, 0),
            createdAt: o.createdAt,
          })),
        );
        setVouchers([]);
        return;
      }
      const res = await fetch(`/api/admin/customers/${customerId}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.mode !== "live") {
        throw new Error(json?.error ?? "Could not load the customer.");
      }
      setCustomer(json.customer);
      setAddresses(json.addresses ?? []);
      setOrders(json.orders ?? []);
      setVouchers(json.vouchers ?? []);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load the customer.",
      );
    }
  }, [mode, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDisabled() {
    if (!customer || mode !== "live") return;
    const next = !customer.disabled;
    const verb = next ? "Disable" : "Enable";
    if (
      !window.confirm(
        `${verb} this account? ${
          next
            ? "They will no longer be able to place orders or request pickups (sign-in and history stay available)."
            : "They will be able to order again immediately."
        }`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message ?? json?.error ?? "Could not update the account.");
      }
      setCustomer({ ...customer, disabled: Boolean(json.customer?.disabled) });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not update the account.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-bold text-red-800">{loadError}</p>
        <Link
          href="/admin/customers"
          className="btn-press mt-3 inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  if (!customer) {
    return (
      <div aria-label="Loading customer" className="grid gap-4">
        <div className="rounded-xl border border-admin-border bg-white p-5">
          <SkeletonText lines={4} />
        </div>
        <div className="rounded-xl border border-admin-border bg-white p-5">
          <SkeletonText lines={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4">
      <Panel title={customer.name ?? "Unnamed customer"}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-admin-muted">Phone</dt>
            <dd className="font-bold text-ink-900">{customer.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Email</dt>
            <dd className="font-bold text-ink-900">
              {customer.email ?? (mode === "demo" ? "Demo order (no account)" : "—")}
            </dd>
          </div>
          <div>
            <dt className="text-admin-muted">Role</dt>
            <dd className="font-bold text-ink-900">{roleLabel(customer.role)}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Joined</dt>
            <dd className="font-bold text-ink-900">{formatDate(customer.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Orders (excl. cancelled)</dt>
            <dd className="font-bold text-ink-900">{customer.ordersCount}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Last order</dt>
            <dd className="font-bold text-ink-900">{formatDate(customer.lastOrderAt)}</dd>
          </div>
          <div>
            <dt className="text-admin-muted">Lifetime spend (collected)</dt>
            <dd className="font-bold text-ink-900">
              {formatPaise(customer.lifetimeSpendPaise)}
            </dd>
          </div>
          <div>
            <dt className="text-admin-muted">Outstanding</dt>
            <dd className="font-bold text-ink-900">
              {formatPaise(customer.outstandingPaise)}
            </dd>
          </div>
        </dl>

        {mode === "live" && (
          <div className="mt-5 border-t border-admin-border pt-4">
            {customer.disabled ? (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-800">
                This account is DISABLED — it cannot place orders or request
                pickups. Sign-in and order history still work.
              </p>
            ) : null}
            {canManage ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleDisabled()}
                  className={`btn-press inline-flex min-h-[44px] items-center rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                    customer.disabled
                      ? "bg-brand-600 hover:bg-brand-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {busy
                    ? "Saving…"
                    : customer.disabled
                      ? "Enable account"
                      : "Disable account"}
                </button>
                {actionError && (
                  <p className="mt-2 text-sm font-bold text-red-700">{actionError}</p>
                )}
              </>
            ) : (
              <p className="text-[13px] text-admin-muted">
                Account disabling needs an Admin account or higher — your tier
                can view this customer but not change their status.
              </p>
            )}
          </div>
        )}
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Addresses">
          {addresses.length === 0 ? (
            <p className="text-sm text-admin-muted">No saved addresses.</p>
          ) : (
            <ul className="grid gap-3">
              {addresses.map((a) => (
                <li key={a.id} className="rounded-lg bg-admin-panel px-3.5 py-3 text-sm">
                  <span className="font-bold text-ink-900">{a.label}</span>
                  <span className="block text-ink-900">
                    {a.line}
                    {a.area ? `, ${a.area}` : ""}, {a.city} — {a.pincode}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Active vouchers">
          {vouchers.length === 0 ? (
            <p className="text-sm text-admin-muted">
              No active vouchers issued to this customer&rsquo;s phone.
            </p>
          ) : (
            <ul className="divide-y divide-admin-border">
              {vouchers.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-bold text-ink-900">{v.code}</span>
                  <span className="text-admin-muted">
                    {v.kind === "prepaid_card" && v.balancePaise != null
                      ? `${formatPaise(v.balancePaise)} left`
                      : v.status.replaceAll("_", " ")}
                    {v.validUntil ? ` · until ${formatDate(v.validUntil)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent orders">
        {orders.length === 0 ? (
          <p className="text-sm text-admin-muted">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-admin-border text-[11px] uppercase tracking-[0.12em] text-admin-muted">
                  <th className="py-2.5 pr-3 font-bold">Order</th>
                  <th className="py-2.5 pr-3 font-bold">Date</th>
                  <th className="py-2.5 pr-3 font-bold">Status</th>
                  <th className="py-2.5 pr-3 text-right font-bold">Items</th>
                  <th className="py-2.5 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-admin-panel/60">
                    <td className="py-3 pr-3">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-bold text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        #{o.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-3 pr-3">{formatDate(o.createdAt)}</td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                        {statusLabel(o.status)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right">{o.itemCount}</td>
                    <td className="py-3 text-right font-bold">
                      {formatPaise(o.totalPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
