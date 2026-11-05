"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/pricing";

export interface StaffTask {
  assignmentId: string;
  leg: "pickup" | "delivery";
  assignedAt: string;
  employeeId: string;
  employeeName: string | null;
  order: {
    id: string;
    ref: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    deliveryType: string;
    pickupSlot: string | null;
    deliverySlot: string | null;
    createdAt: string;
    itemCount: number;
  };
  customer: { name: string | null; phone: string | null };
  address: {
    line: string;
    area: string;
    city: string;
    pincode: string;
    lat: number | null;
    lng: number | null;
  } | null;
  codDuePaise: number | null;
  awaitingThisLeg: boolean;
  blockedByLabel: string | null;
  lastPingAt: string | null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; tasks: StaffTask[]; supportView: boolean };

function slotLabel(task: StaffTask): string | null {
  const slot = task.leg === "pickup" ? task.order.pickupSlot : task.order.deliverySlot;
  if (!slot) return null;
  const d = new Date(slot);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Staff home — "My rounds". Every card is one ACTIVE assignment from
 * GET /api/staff/tasks (the API scopes staff callers to their own
 * rounds; admins see the support view with rider names). Auto-
 * refreshes every 30s so a newly assigned round appears without the
 * rider hunting for a reload button.
 */
export default function StaffTasksPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/tasks", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !Array.isArray(data.tasks)) {
        setState({
          kind: "error",
          message:
            data?.error ?? "Could not load your rounds. Check your connection and retry.",
        });
        return;
      }
      setState({ kind: "ready", tasks: data.tasks, supportView: Boolean(data.supportView) });
    } catch {
      setState({
        kind: "error",
        message: "Could not load your rounds. Check your connection and retry.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">My rounds</h1>
          <p className="mt-1 text-sm text-ink-500">
            Pickups and deliveries assigned to you. Tap a round to open it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-full border border-mist-300 bg-white px-3.5 py-2 text-xs font-bold text-ink-700 hover:bg-mist-100"
        >
          Refresh
        </button>
      </div>

      {state.kind === "loading" && (
        <p role="status" className="mt-8 text-sm text-ink-500">Loading your rounds…</p>
      )}

      {state.kind === "error" && (
        <div role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-ink-900">Something went wrong</p>
          <p className="mt-1 text-sm text-ink-700">{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" && state.tasks.length === 0 && (
        <div className="mt-8 rounded-2xl border border-mist-200 bg-white p-6 text-center">
          <p className="text-base font-bold text-ink-900">No rounds right now</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-500">
            When the office assigns a pickup or delivery to you, it will
            appear here. This page checks again every 30 seconds.
          </p>
        </div>
      )}

      {state.kind === "ready" && state.tasks.length > 0 && (
        <ul className="mt-6 grid gap-4">
          {state.tasks.map((task) => {
            const slot = slotLabel(task);
            return (
              <li key={task.assignmentId}>
                <Link
                  href={`/staff/tasks/${task.assignmentId}`}
                  className="block rounded-2xl border border-mist-200 bg-white p-5 shadow-sm transition hover:border-brand-300"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        task.leg === "pickup"
                          ? "rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-sky-800"
                          : "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-800"
                      }
                    >
                      {task.leg === "pickup" ? "Pickup" : "Delivery"}
                    </span>
                    <span className="text-sm font-extrabold text-ink-900">
                      Order #{task.order.ref}
                    </span>
                    {task.order.deliveryType === "express" && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                        Express
                      </span>
                    )}
                    {task.lastPingAt && (
                      <span className="ml-auto text-xs font-semibold text-brand-700">
                        Location shared
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-sm font-semibold text-ink-900">
                    {task.customer.name ?? "Customer"}
                    {task.address ? ` · ${task.address.area}` : ""}
                  </p>
                  {task.address && (
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                      {task.address.line}, {task.address.city} — {task.address.pincode}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-500">
                    {slot && <span>Slot: {slot}</span>}
                    <span>
                      {task.order.itemCount} item{task.order.itemCount === 1 ? "" : "s"}
                    </span>
                    {state.supportView && task.employeeName && (
                      <span>Rider: {task.employeeName}</span>
                    )}
                  </div>

                  {task.leg === "delivery" &&
                    task.codDuePaise !== null &&
                    task.codDuePaise > 0 && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                        Collect {formatPaise(task.codDuePaise)} in cash at the door
                      </p>
                    )}
                  {!task.awaitingThisLeg && (
                    <p className="mt-3 rounded-xl bg-mist-100 px-3 py-2 text-xs font-semibold text-ink-700">
                      Heads-up: the order is still at an earlier step
                      {task.blockedByLabel ? ` (${task.blockedByLabel})` : ""}. You
                      can head out when it reaches your step — the handover
                      unlocks then.
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
