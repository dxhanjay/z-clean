"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import { STAFF_ROLES, staffRoleLabel, type Employee } from "@/lib/org";
import {
  HANDOVER_CHAIN,
  completedPointIds,
  nextHandoverPoint,
  orderItemCount,
  receivingRoles,
} from "@/lib/handovers";
import { listDemoEmployees } from "@/lib/demo-org";
import { listDemoOrders } from "@/lib/demo-store";
import { listDemoHandovers } from "@/lib/demo-handovers";

/**
 * Stage Queues (Phase 8) — "My Stage" for the admin console.
 *
 * Pick an employee and see exactly the handover points they can
 * RECEIVE at (their roles against the chain) with the orders awaiting
 * each point, oldest first. Awaiting is derived — live: by the API
 * from order status + recorded handovers; demo: by the same pure
 * derivation over the demo stores. One click jumps to the order's
 * handover card.
 *
 * Staff have no separate logins yet, so queues are viewed by selecting
 * the employee here in the admin console — the page says so, and every
 * completion is recorded against the selected employee.
 */

interface StageQueueOrder {
  id: string;
  ref: string;
  status: string;
  itemCount: number;
  customerName: string | null;
  createdAt: string;
  pickupLine: string;
}

interface StageQueue {
  pointId: string;
  label: string;
  method: string;
  count: number;
  orders: StageQueueOrder[];
}

function shortRef(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8).toUpperCase()}…` : id;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminStages({ mode }: { mode: "live" | "demo" }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [queues, setQueues] = useState<StageQueue[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);

  const selected = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? null,
    [employees, employeeId],
  );

  const computeDemoQueues = useCallback((emp: Employee): StageQueue[] => {
    const orders = listDemoOrders();
    const allHandovers = listDemoHandovers();
    const receivable = HANDOVER_CHAIN.filter((p) =>
      receivingRoles(p).some((r) => (emp.roles as string[]).includes(r)),
    );
    return receivable.map((point) => {
      const awaiting: StageQueueOrder[] = [];
      for (const o of orders) {
        const next = nextHandoverPoint(
          o.status,
          completedPointIds(allHandovers.filter((h) => h.orderId === o.id)),
        );
        if (next?.id !== point.id) continue;
        awaiting.push({
          id: o.id,
          ref: shortRef(o.id),
          status: o.status,
          itemCount: orderItemCount(o.items),
          customerName: o.name,
          createdAt: o.createdAt,
          pickupLine: `${o.pickupDate} · ${o.pickupSlot}`,
        });
      }
      return {
        pointId: point.id,
        label: point.label,
        method: point.method,
        count: awaiting.length,
        orders: awaiting,
      };
    });
  }, []);

  /* Load the employee list (live API, or the demo store). */
  useEffect(() => {
    (async () => {
      if (mode === "demo") {
        const emps = listDemoEmployees();
        setEmployees(emps);
        setEmployeeId((prev) => prev || (emps[0]?.id ?? ""));
        setState("ready");
        return;
      }
      try {
        const res = await fetch("/api/admin/stages");
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.mode !== "live") {
          setErrorText(json?.error ?? "Could not load the stage queues.");
          setState("error");
          return;
        }
        const emps = json.employees as Employee[];
        setEmployees(emps);
        setEmployeeId((prev) => prev || (emps[0]?.id ?? ""));
        setState("ready");
      } catch {
        setErrorText("Could not load the stage queues.");
        setState("error");
      }
    })();
  }, [mode]);

  /* Load the selected employee's queues. */
  useEffect(() => {
    if (!selected) {
      setQueues([]);
      return;
    }
    if (mode === "demo") {
      setQueues(computeDemoQueues(selected));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/stages?employeeId=${encodeURIComponent(selected.id)}`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || json?.mode !== "live") {
          setErrorText(json?.error ?? "Could not load this employee's queues.");
          setState("error");
          return;
        }
        setQueues(
          (json.queues as {
            pointId: string;
            label: string;
            method: string;
            count: number;
            orders: {
              id: string;
              status: string;
              itemCount: number;
              customerName: string | null;
              createdAt: string;
              pickupSlot: string;
            }[];
          }[]).map((q) => ({
            pointId: q.pointId,
            label: q.label,
            method: q.method,
            count: q.count,
            orders: q.orders.map((o) => ({
              id: o.id,
              ref: shortRef(o.id),
              status: o.status,
              itemCount: o.itemCount,
              customerName: o.customerName,
              createdAt: o.createdAt,
              pickupLine: fmt(o.pickupSlot),
            })),
          })),
        );
      } catch {
        if (!cancelled) {
          setErrorText("Could not load this employee's queues.");
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, selected, computeDemoQueues]);

  const totalAwaiting = queues.reduce((sum, q) => sum + q.count, 0);

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Stage queues
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-500">
        Each employee&apos;s work queue: the handover points they can
        receive at, and the orders waiting at each one. Staff act from
        this admin console — employee logins are not enabled yet — so a
        queue is viewed by selecting the employee, and every handover
        they complete is recorded against them.
      </p>

      {state === "error" && (
        <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {errorText ?? "Could not load the stage queues."}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-brand-100 p-4 sm:p-6">
        <label className="grid max-w-xl gap-1.5 text-sm">
          <span className="font-semibold text-ink-900">Employee</span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="min-h-[44px] rounded-xl border border-brand-200 px-3 py-2.5 text-sm font-semibold text-ink-900"
          >
            {employees.length === 0 && <option value="">No employees yet</option>}
            {STAFF_ROLES.map((role) => {
              const group = employees.filter((e) =>
                (e.roles as string[]).includes(role.role),
              );
              if (group.length === 0) return null;
              return (
                <optgroup key={role.role} label={role.label}>
                  {group.map((e) => (
                    <option key={`${role.role}-${e.id}`} value={e.id}>
                      {e.fullName} ({e.employeeCode})
                      {e.employmentStatus !== "active" ? " — inactive" : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>

        {selected && (
          <p className="mt-3 text-sm text-ink-500">
            <span className="font-semibold text-ink-900">{selected.fullName}</span>{" "}
            · {selected.roles.map(staffRoleLabel).join(", ")} ·{" "}
            {selected.employmentStatus}
            {selected.employmentStatus !== "active" &&
              " — inactive employees cannot receive handovers, so their queues stay empty of completable work."}
          </p>
        )}
        {mode === "demo" && (
          <p className="mt-2 text-sm leading-relaxed text-amber-900">
            DEMO MODE — the demo seeds three employees. To walk the full
            chain here, create demo employees with the remaining roles
            (Collection Center, Inbound/Outbound Transporter, Ironing
            Staff, Packer) on the Employees screen.
          </p>
        )}
      </div>

      {state === "loading" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2" aria-label="Loading queues">
          {[0, 1, 2].map((card) => (
            <div key={card} className="rounded-2xl border border-brand-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Skeleton className="h-5 w-40 max-w-[55%]" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <SkeletonText lines={2} className="mt-3" />
            </div>
          ))}
        </div>
      ) : !selected ? (
        <p className="mt-6 text-sm text-ink-500">
          Add an employee on the Employees screen to see stage queues.
        </p>
      ) : queues.length === 0 ? (
        <p className="mt-6 text-sm text-ink-500">
          {selected.fullName} holds no role that receives a handover
          (cashier and management roles don&apos;t take custody of items).
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm font-semibold text-ink-900">
            {totalAwaiting} order{totalAwaiting === 1 ? "" : "s"} awaiting{" "}
            {selected.fullName} across {queues.length} point
            {queues.length === 1 ? "" : "s"}
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {queues.map((q) => (
              <div key={q.pointId} className="rounded-2xl border border-brand-100 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold text-ink-900">{q.label}</h2>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      q.count > 0
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-700"
                    }`}
                  >
                    {q.count} waiting · {q.method === "otp" ? "OTP" : "QR"}
                  </span>
                </div>
                {q.orders.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-500">Nothing waiting here.</p>
                ) : (
                  <ul className="mt-3 grid gap-2">
                    {q.orders.map((o) => (
                      <li key={o.id}>
                        <Link
                          href={`/admin/orders/${o.id}#handover`}
                          className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-50 px-3 py-2 text-sm hover:border-brand-300 hover:bg-brand-50/50"
                        >
                          <span>
                            <span className="font-bold text-ink-900">{o.ref}</span>
                            {o.customerName ? (
                              <span className="text-ink-500"> · {o.customerName}</span>
                            ) : null}
                            <span className="block text-xs text-ink-500">
                              {o.itemCount} item{o.itemCount === 1 ? "" : "s"} · pickup{" "}
                              {o.pickupLine} · ordered {fmt(o.createdAt)}
                            </span>
                          </span>
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                            {o.status.replaceAll("_", " ")} →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
