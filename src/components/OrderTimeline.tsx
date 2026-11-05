"use client";

import { ORDER_STEPS, stepIndex, statusLabel } from "@/lib/order-flow";
import type { PresentationStage } from "@/lib/tracking-view";

/**
 * Customer tracking timeline (Phase 4). Purely presentational: it maps
 * the order's current status + status history (live order_status_history
 * rows, or the demo order's history array — same shape) onto the
 * canonical steps from src/lib/order-flow.ts.
 *
 * - Completed steps show the timestamp (and admin note, if any) of the
 *   history event that moved the order into that step.
 * - The current step is highlighted; future steps are muted.
 * - PLACED usually has no history row of its own (orders enter at
 *   PICKUP_SCHEDULED / PAYMENT_PENDING), so it falls back to the order's
 *   creation time.
 * - CANCELLED orders render a cancelled panel instead of the steps.
 * - Payment side-states (PAYMENT_PENDING / PAYMENT_FAILED) highlight no
 *   step; the payment panel next to the timeline explains them.
 *
 * Phase D: when the caller passes `presentation` (the 12-stage list
 * derived by src/lib/tracking-view.ts `presentationStages` — canonical
 * statuses + the "Rider on the way" leg + the plant care stages from
 * the order's real handover milestones), the rail renders those
 * stages instead, with the same visual language. Callers that pass
 * nothing (the admin order detail) get the canonical rail unchanged.
 */

export interface TimelineEvent {
  status: string;
  note?: string | null;
  at: string; // ISO
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function OrderTimeline({
  status,
  history,
  createdAt,
  presentation,
}: {
  status: string;
  history: TimelineEvent[];
  createdAt?: string;
  /** Phase D: 12-stage presentation (customer order page only). */
  presentation?: PresentationStage[];
}) {
  if (status === "CANCELLED") {
    const cancelEvent = [...history].reverse().find((h) => h.status === "CANCELLED");
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-bold text-red-800">This order was cancelled</h2>
        {cancelEvent && (
          <p className="mt-2 text-sm text-red-700">
            Cancelled on {fmt(cancelEvent.at)}
            {cancelEvent.note ? ` — ${cancelEvent.note}` : ""}
          </p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-red-700">
          If this was a mistake or you still need the pickup, please place a
          new order and we will take care of it.
        </p>
      </div>
    );
  }

  /* Phase D — 12-stage presentation rail. Same visual language as
     the canonical rail below; the stage states/times/notes were
     derived by the pure `presentationStages` in tracking-view.ts,
     so this stays purely presentational. */
  if (presentation) {
    const sideState = stepIndex(status) === -1;
    return (
      <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
        <h2 className="font-bold text-ink-900">Track your order</h2>
        {sideState && (
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            {status === "PAYMENT_FAILED"
              ? "The online payment for this order failed, so the pickup is not scheduled yet."
              : "Your order is waiting on its online payment. Once the payment is confirmed, the pickup is scheduled and tracking starts here."}
          </p>
        )}
        <ol className="mt-5">
          {presentation.map((stage, idx) => {
            const done = stage.state === "done";
            const isCurrent = stage.state === "current";
            const reached = done || isCurrent;
            return (
              <li key={stage.id} className="relative flex gap-4 pb-6 last:pb-0">
                {idx < presentation.length - 1 && (
                  <span
                    aria-hidden
                    className={`absolute left-[13px] top-7 h-[calc(100%-28px)] w-0.5 ${
                      done ? "bg-brand-500" : "bg-brand-100"
                    }`}
                  />
                )}
                <span
                  aria-hidden
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                    isCurrent
                      ? "bg-brand-600 text-white ring-4 ring-brand-100"
                      : done
                        ? "bg-brand-500 text-white"
                        : "border border-brand-200 bg-white text-ink-500/70"
                  }`}
                >
                  {done ? "✓" : idx + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p
                    className={`text-sm font-bold ${
                      reached ? "text-ink-900" : "text-ink-500/70"
                    }`}
                  >
                    {stage.label}
                    {isCurrent && (
                      <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                        Current step
                      </span>
                    )}
                  </p>
                  {reached ? (
                    <>
                      {stage.at && (
                        <p className="mt-0.5 text-xs text-ink-500">{fmt(stage.at)}</p>
                      )}
                      {stage.note && (
                        <p className="mt-1 text-sm leading-relaxed text-ink-500">
                          {stage.note}
                        </p>
                      )}
                      {isCurrent && !stage.note && (
                        <p className="mt-1 text-sm leading-relaxed text-ink-500">
                          {stage.hint}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-0.5 text-xs text-ink-500/70">{stage.hint}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-ink-500/70">
          Status today: {statusLabel(status)}.
        </p>
      </div>
    );
  }

  const currentIdx = stepIndex(status);

  // Latest event per canonical step wins (a step can gain extra audit
  // notes later, e.g. a COD collection recorded at DELIVERED).
  const eventFor = (stepStatus: string): TimelineEvent | undefined => {
    const matches = history.filter((h) => h.status === stepStatus);
    return matches[matches.length - 1];
  };

  return (
    <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
      <h2 className="font-bold text-ink-900">Track your order</h2>
      {currentIdx === -1 && (
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          {status === "PAYMENT_FAILED"
            ? "The online payment for this order failed, so the pickup is not scheduled yet."
            : "Your order is waiting on its online payment. Once the payment is confirmed, the pickup is scheduled and tracking starts here."}
        </p>
      )}
      <ol className="mt-5">
        {ORDER_STEPS.map((step, idx) => {
          const done = currentIdx >= 0 && idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const event = eventFor(step.status);
          const when =
            event?.at ?? (step.status === "PLACED" ? createdAt : undefined);
          const reached = done || isCurrent;
          return (
            <li key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
              {idx < ORDER_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute left-[13px] top-7 h-[calc(100%-28px)] w-0.5 ${
                    done ? "bg-brand-500" : "bg-brand-100"
                  }`}
                />
              )}
              <span
                aria-hidden
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  isCurrent
                    ? "bg-brand-600 text-white ring-4 ring-brand-100"
                    : done
                      ? "bg-brand-500 text-white"
                      : "border border-brand-200 bg-white text-ink-500/70"
                }`}
              >
                {done ? "✓" : idx + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={`text-sm font-bold ${
                    reached ? "text-ink-900" : "text-ink-500/70"
                  }`}
                >
                  {step.label}
                  {isCurrent && (
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                      Current step
                    </span>
                  )}
                </p>
                {reached ? (
                  <>
                    {when && (
                      <p className="mt-0.5 text-xs text-ink-500">{fmt(when)}</p>
                    )}
                    {event?.note && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-500">
                        {event.note}
                      </p>
                    )}
                    {isCurrent && !event?.note && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-500">
                        {step.hint}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-0.5 text-xs text-ink-500/70">{step.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-ink-500/70">
        Status today: {statusLabel(status)}.
      </p>
    </div>
  );
}
