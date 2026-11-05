"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Rider assignments card (Staff Web App phase) — admin order detail.
 *
 * Assigns the order's pickup and delivery legs to field employees
 * via /api/admin/orders/[id]/assignments. The eligible list comes
 * from the API (active employees holding the leg's handover-chain
 * role — the server re-checks the same rule on save), so the select
 * only ever offers people who can actually complete the leg.
 *
 * An assignment is what puts the round in the rider's staff app and
 * opens their location sharing. It closes by itself when the leg's
 * handover completes; "Close" here is the admin override for a leg
 * that will not run.
 */

interface AssignmentView {
  id: string;
  leg: "pickup" | "delivery";
  employeeId: string;
  employeeName: string | null;
  assignedAt: string;
  completedAt: string | null;
  active: boolean;
}

interface EligibleEmployee {
  id: string;
  fullName: string;
  roles: string[];
}

const LEGS: { leg: "pickup" | "delivery"; title: string; hint: string }[] = [
  {
    leg: "pickup",
    title: "Pickup rider",
    hint: "Collects the clothes from the customer and hands them in at the plant.",
  },
  {
    leg: "delivery",
    title: "Delivery rider",
    hint: "Carries the finished order back to the customer's door.",
  },
];

export default function AdminOrderAssignments({
  orderId,
  mode,
}: {
  orderId: string;
  mode: "live" | "demo";
}) {
  const [assignments, setAssignments] = useState<AssignmentView[]>([]);
  const [eligible, setEligible] = useState<{
    pickup: EligibleEmployee[];
    delivery: EligibleEmployee[];
  }>({ pickup: [], delivery: [] });
  const [selected, setSelected] = useState<Record<string, string>>({
    pickup: "",
    delivery: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [busyLeg, setBusyLeg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/assignments`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        setError(json?.error ?? "Could not load rider assignments.");
        return;
      }
      setAssignments(json.assignments ?? []);
      setEligible(json.eligible ?? { pickup: [], delivery: [] });
      setLoaded(true);
    } catch {
      setError("Could not load rider assignments.");
    }
  }, [orderId]);

  useEffect(() => {
    if (mode === "live") void load();
  }, [mode, load]);

  async function assign(leg: "pickup" | "delivery") {
    const employeeId = selected[leg];
    if (!employeeId) return;
    setBusyLeg(leg);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leg, employeeId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not save the assignment.");
        return;
      }
      setFeedback(
        `${leg === "pickup" ? "Pickup" : "Delivery"} leg assigned — it is now on the rider's rounds in the staff app.`,
      );
      setSelected((s) => ({ ...s, [leg]: "" }));
      await load();
    } catch {
      setError("Could not save the assignment.");
    } finally {
      setBusyLeg(null);
    }
  }

  async function closeAssignment(assignment: AssignmentView) {
    setBusyLeg(assignment.leg);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/assignments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: assignment.id, action: "complete" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Could not close the assignment.");
        return;
      }
      setFeedback("Assignment closed. The rider's round and location sharing have ended.");
      await load();
    } catch {
      setError("Could not close the assignment.");
    } finally {
      setBusyLeg(null);
    }
  }

  if (mode === "demo") {
    return (
      <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
        <h2 className="font-bold text-ink-900">Rider assignments</h2>
        <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          DEMO MODE — rider assignments put real rounds into the staff
          app, so they are available in live mode only.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
      <h2 className="font-bold text-ink-900">Rider assignments</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
        Assign each leg to a field employee. The round appears in their
        staff app, where they can share their location and complete the
        handover with the customer&apos;s code.
      </p>

      {feedback && (
        <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-5">
        {LEGS.map(({ leg, title, hint }) => {
          const active = assignments.find((a) => a.leg === leg && a.active);
          const options = eligible[leg];
          return (
            <div key={leg} className="rounded-xl border border-brand-50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-ink-900">{title}</p>
                {active ? (
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                    {active.employeeName ?? "Assigned"} · since{" "}
                    {new Date(active.assignedAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                ) : (
                  <span className="rounded-full bg-mist-100 px-2.5 py-1 text-xs font-bold text-ink-500">
                    Not assigned
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{hint}</p>

              {loaded && options.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">
                  No active employee holds the {leg} role yet — add the role
                  under Employees first.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label={`${title} employee`}
                    value={selected[leg]}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [leg]: e.target.value }))
                    }
                    className="min-h-[44px] flex-1 rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">
                      {active ? "Reassign to…" : "Choose an employee…"}
                    </option>
                    {options
                      .filter((e) => e.id !== active?.employeeId)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.fullName}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={busyLeg === leg || !selected[leg]}
                    onClick={() => void assign(leg)}
                    className="btn-press min-h-[44px] rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {busyLeg === leg ? "Saving…" : active ? "Reassign" : "Assign"}
                  </button>
                  {active && (
                    <button
                      type="button"
                      disabled={busyLeg === leg}
                      onClick={() => void closeAssignment(active)}
                      className="min-h-[44px] rounded-full border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                      Close
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {assignments.some((a) => !a.active) && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
            Earlier assignments
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm text-ink-500">
            {assignments
              .filter((a) => !a.active)
              .map((a) => (
                <li key={a.id}>
                  {a.leg === "pickup" ? "Pickup" : "Delivery"} —{" "}
                  {a.employeeName ?? "Employee"} · assigned{" "}
                  {new Date(a.assignedAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {a.completedAt
                    ? ` · closed ${new Date(a.completedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                    : ""}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
