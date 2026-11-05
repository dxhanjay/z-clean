"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";
import { roleLabel } from "@/lib/roles";
import { Skeleton } from "@/components/Skeleton";
import { groupDemoCustomers } from "@/lib/demo-customers";

/**
 * Customer Management list (Delta 1) — search + pagination over
 * GET /api/admin/customers (live). Demo mode groups this browser's
 * demo orders by customer phone (src/lib/demo-customers.ts) — demo
 * has no accounts, so email/role/disable are live concepts and the
 * demo rows say so by their absence.
 */

export interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  disabled: boolean;
  createdAt: string;
  ordersCount: number;
  lifetimeSpendPaise: number;
  lastOrderAt: string | null;
}

const PAGE_SIZE = 20;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminCustomers({ mode }: { mode: "live" | "demo" }) {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      if (mode === "demo") {
        const all = groupDemoCustomers();
        const q = search.trim().toLowerCase();
        const filtered = q
          ? all.filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                c.phone.toLowerCase().includes(q),
            )
          : all;
        setTotal(filtered.length);
        setRows(
          filtered
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            .map(({ orders: _orders, ...row }) => row),
        );
        return;
      }
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/customers?${params.toString()}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.mode !== "live") {
        throw new Error(json?.error ?? "Could not load customers.");
      }
      setRows(json.customers ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load customers.");
    }
  }, [mode, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rounded-xl border border-admin-border bg-white p-5">
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(query);
        }}
      >
        <label className="sr-only" htmlFor="customer-search">
          Search customers by name, email or phone
        </label>
        <input
          id="customer-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email or phone…"
          className="min-h-[44px] flex-1 rounded-lg border border-admin-border px-3.5 text-sm text-ink-900 outline-none focus:border-brand-600"
        />
        <button
          type="submit"
          className="btn-press min-h-[44px] rounded-full bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      {loadError ? (
        <div>
          <p className="text-sm font-bold text-red-800">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="btn-press mt-3 inline-flex min-h-[44px] items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      ) : rows === null ? (
        <div aria-label="Loading customers" className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-admin-muted">
          {search
            ? `No customers match “${search}”.`
            : "No customer accounts yet."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-admin-border text-[11px] uppercase tracking-[0.12em] text-admin-muted">
                  <th className="py-2.5 pr-3 font-bold">Customer</th>
                  <th className="py-2.5 pr-3 font-bold">Contact</th>
                  <th className="py-2.5 pr-3 font-bold">Role</th>
                  <th className="py-2.5 pr-3 text-right font-bold">Orders</th>
                  <th className="py-2.5 pr-3 text-right font-bold">Lifetime spend</th>
                  <th className="py-2.5 pr-3 font-bold">Last order</th>
                  <th className="py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-admin-panel/60">
                    <td className="py-3 pr-3">
                      <Link
                        href={`/admin/customers/${encodeURIComponent(c.id)}`}
                        className="font-bold text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        {c.name ?? "Unnamed customer"}
                      </Link>
                      <span className="block text-xs text-admin-muted">
                        Joined {formatDate(c.createdAt)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-ink-900">
                      {c.phone ?? "—"}
                      <span className="block text-xs text-admin-muted">
                        {c.email ?? (mode === "demo" ? "Demo order" : "—")}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{roleLabel(c.role)}</td>
                    <td className="py-3 pr-3 text-right font-bold">{c.ordersCount}</td>
                    <td className="py-3 pr-3 text-right font-bold">
                      {formatPaise(c.lifetimeSpendPaise)}
                    </td>
                    <td className="py-3 pr-3">{formatDate(c.lastOrderAt)}</td>
                    <td className="py-3">
                      {c.disabled ? (
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                          Disabled
                        </span>
                      ) : (
                        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <p className="text-admin-muted">
              {total} customer{total === 1 ? "" : "s"} · page {page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-press min-h-[40px] rounded-full bg-admin-panel px-4 font-bold text-ink-900 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="btn-press min-h-[40px] rounded-full bg-admin-panel px-4 font-bold text-ink-900 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
