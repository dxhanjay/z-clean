"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ShareLocationPanel from "@/components/staff/ShareLocationPanel";
import HandoverPanel from "@/components/staff/HandoverPanel";
import { formatPaise } from "@/lib/pricing";
import type { StaffTask } from "../../page";

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "notfound" }
  | { kind: "ready"; task: StaffTask; supportView: boolean }
  | { kind: "done"; task: StaffTask; status: string };

function mapsDestination(task: StaffTask): string {
  if (task.address?.lat !== null && task.address?.lat !== undefined &&
      task.address?.lng !== null && task.address?.lng !== undefined) {
    return `${task.address.lat},${task.address.lng}`;
  }
  if (task.address) {
    return encodeURIComponent(
      `${task.address.line}, ${task.address.area}, ${task.address.city} ${task.address.pincode}`,
    );
  }
  return "";
}

/**
 * One round, in full: where to go (address + Navigate deep link),
 * who to call, what to collect (COD on delivery legs), the Share
 * Location panel, and the OTP handover that closes the leg.
 *
 * Data comes from GET /api/staff/tasks — the same scoped list as the
 * home page — so a rider who guesses another assignment's URL simply
 * finds "not on your rounds": the API never returns it to them.
 * Support view (admin tiers) renders everything read-only: no
 * sharing, no handover — those are rider acts.
 */
export default function StaffTaskDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);
  const [state, setState] = useState<PageState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/tasks", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !Array.isArray(data.tasks)) {
        setState({
          kind: "error",
          message: data?.error ?? "Could not load this round. Please retry.",
        });
        return;
      }
      const task = (data.tasks as StaffTask[]).find(
        (t) => t.assignmentId === assignmentId,
      );
      if (!task) {
        setState({ kind: "notfound" });
        return;
      }
      setState((current) =>
        current.kind === "done"
          ? current
          : { kind: "ready", task, supportView: Boolean(data.supportView) },
      );
    } catch {
      setState({
        kind: "error",
        message: "Could not load this round. Check your connection and retry.",
      });
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return <p role="status" className="text-sm text-ink-500">Loading this round…</p>;
  }

  if (state.kind === "error") {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">
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
    );
  }

  if (state.kind === "notfound") {
    return (
      <div className="rounded-2xl border border-mist-200 bg-white p-6 text-center">
        <p className="text-base font-bold text-ink-900">Not on your rounds</p>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-500">
          This round is not assigned to you, or it has already been
          completed. Head back to your rounds list for what is current.
        </p>
        <Link
          href="/staff"
          className="mt-4 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          Back to my rounds
        </Link>
      </div>
    );
  }

  const { task } = state;
  const done = state.kind === "done";
  const supportView = state.kind === "ready" ? state.supportView : false;
  const destination = mapsDestination(task);
  const codDue = task.codDuePaise !== null && task.codDuePaise > 0;

  return (
    <div className="grid gap-4">
      <div>
        <Link href="/staff" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          ← All rounds
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={
              task.leg === "pickup"
                ? "rounded-full bg-sky-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-sky-800"
                : "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-800"
            }
          >
            {task.leg === "pickup" ? "Pickup" : "Delivery"}
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-ink-900">
            Order #{task.order.ref}
          </h1>
          {task.order.deliveryType === "express" && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
              Express
            </span>
          )}
        </div>
        {supportView && task.employeeName && (
          <p className="mt-1 text-sm text-ink-500">Rider: {task.employeeName}</p>
        )}
      </div>

      {done && (
        <div role="status" className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
          <p className="text-lg font-extrabold text-ink-900">
            {task.leg === "pickup" ? "Pickup complete" : "Delivery complete"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-700">
            {task.leg === "pickup"
              ? "The handover is recorded and the order is on its way to the plant. Location sharing for this round has closed."
              : "The handover is recorded and the order is delivered. Location sharing for this round has closed."}
          </p>
          <Link
            href="/staff"
            className="mt-4 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Back to my rounds
          </Link>
        </div>
      )}

      {!done && (
        <>
          <section className="rounded-2xl border border-mist-200 bg-white p-5">
            <h2 className="text-base font-extrabold text-ink-900">
              {task.leg === "pickup" ? "Collect from" : "Deliver to"}
            </h2>
            <p className="mt-2 text-sm font-semibold text-ink-900">
              {task.customer.name ?? "Customer"}
            </p>
            {task.address ? (
              <p className="mt-0.5 text-sm leading-relaxed text-ink-500">
                {task.address.line}
                <br />
                {task.address.area}, {task.address.city} — {task.address.pincode}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-ink-500">
                No address on this order — call the customer or the office.
              </p>
            )}
            <p className="mt-2 text-xs font-semibold text-ink-500">
              {task.order.itemCount} item{task.order.itemCount === 1 ? "" : "s"} on this order
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {destination ? (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-ink-900 px-4 py-3 text-center text-sm font-bold text-white hover:bg-ink-700"
                >
                  Navigate
                </a>
              ) : (
                <span className="rounded-full bg-mist-100 px-4 py-3 text-center text-sm font-bold text-ink-400">
                  Navigate
                </span>
              )}
              {task.customer.phone ? (
                <a
                  href={`tel:${task.customer.phone.replace(/\s/g, "")}`}
                  className="rounded-full border border-brand-600 px-4 py-3 text-center text-sm font-bold text-brand-700 hover:bg-brand-50"
                >
                  Call customer
                </a>
              ) : (
                <span className="rounded-full bg-mist-100 px-4 py-3 text-center text-sm font-bold text-ink-400">
                  No phone on file
                </span>
              )}
            </div>
            {task.leg === "delivery" && codDue && (
              <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-900">
                Collect {formatPaise(task.codDuePaise as number)} in cash at the door
                (pay-on-delivery).
              </p>
            )}
          </section>

          {!supportView && (
            <ShareLocationPanel
              assignmentId={task.assignmentId}
              initialLastPingAt={task.lastPingAt}
            />
          )}

          {supportView ? (
            <section className="rounded-2xl border border-mist-200 bg-mist-100 p-5">
              <p className="text-sm font-semibold text-ink-700">
                Support view — the rider completes the handover from their
                own sign-in. Location sharing and OTP entry are not
                available here.
              </p>
            </section>
          ) : task.awaitingThisLeg ? (
            <HandoverPanel
              assignmentId={task.assignmentId}
              leg={task.leg}
              codDuePaise={task.codDuePaise}
              onCompleted={(status) =>
                setState({ kind: "done", task, status })
              }
            />
          ) : (
            <section className="rounded-2xl border border-mist-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-ink-900">
                Handover unlocks shortly
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                This order is still at an earlier step
                {task.blockedByLabel ? ` — currently: ${task.blockedByLabel}` : ""}.
                The code entry opens as soon as the order reaches your
                step. You can already share your location so the customer
                sees you coming.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
