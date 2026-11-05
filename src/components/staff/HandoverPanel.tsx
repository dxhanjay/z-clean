"use client";

import { useState } from "react";
import { formatPaise } from "@/lib/pricing";

/**
 * Doorstep handover panel (Staff Web App phase) — the rider side of
 * the custody chain's two OTP points (pickup / delivery).
 *
 * The rider asks the customer for the 6-digit code from their order
 * page and types it here — there is deliberately no code shown on
 * the rider's side. The server verifies it with the SAME rules as
 * the office console (shared attempt counter, lockout after 5 wrong
 * tries) via POST /api/staff/tasks/[assignmentId]/handover, which
 * runs the shared handover flow — this panel holds no state machine
 * of its own.
 *
 * QR scanning is intentionally absent: the web app has no existing
 * camera-scan pattern to reuse, and the OTP is the customer's proof
 * either way.
 */
export default function HandoverPanel({
  assignmentId,
  leg,
  codDuePaise,
  onCompleted,
}: {
  assignmentId: string;
  leg: "pickup" | "delivery";
  codDuePaise: number | null;
  onCompleted: (status: string) => void;
}) {
  const [otp, setOtp] = useState("");
  const [quantity, setQuantity] = useState("");
  const [missingItem, setMissingItem] = useState(false);
  const [codCollected, setCodCollected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPickup = leg === "pickup";
  const codDue = codDuePaise !== null && codDuePaise > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the customer's 6-digit code.");
      return;
    }
    const qty = quantity.trim() === "" ? undefined : Number(quantity);
    if (qty !== undefined && (!Number.isInteger(qty) || qty < 1)) {
      setError("Item count must be a whole number of 1 or more.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/staff/tasks/${assignmentId}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otp: otp.trim(),
          ...(qty !== undefined ? { quantity: qty } : {}),
          missingItem,
          ...(leg === "delivery" ? { codCollected } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "The handover could not be completed. Please try again.");
        return;
      }
      onCompleted(String(data?.status ?? ""));
    } catch {
      setError("No connection — the handover was not recorded. Check your signal and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-mist-200 bg-white p-5">
      <h2 className="text-base font-extrabold text-ink-900">
        {isPickup ? "Complete the pickup" : "Complete the delivery"}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">
        Ask the customer for the 6-digit code on their order page and
        enter it here. The code proves the{" "}
        {isPickup ? "clothes changed hands" : "order reached the customer"}.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-4">
        <div>
          <label htmlFor="handover-otp" className="block text-sm font-semibold text-ink-900">
            Customer&apos;s 6-digit code
          </label>
          <input
            id="handover-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className="mt-1.5 w-full rounded-xl border border-mist-300 bg-white px-4 py-3 text-center text-2xl font-extrabold tracking-[0.4em] text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="handover-qty" className="block text-sm font-semibold text-ink-900">
            {isPickup ? "Items / bags collected" : "Items delivered"}{" "}
            <span className="font-normal text-ink-500">(optional)</span>
          </label>
          <input
            id="handover-qty"
            inputMode="numeric"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 6"
            className="mt-1.5 w-full rounded-xl border border-mist-300 bg-white px-4 py-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
          />
        </div>

        <label className="flex items-start gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={missingItem}
            onChange={(e) => setMissingItem(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-mist-300"
          />
          <span>
            Something is missing or short — the office will be told to
            reconcile this order.
          </span>
        </label>

        {leg === "delivery" && codDue && (
          <label className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900">
            <input
              type="checkbox"
              checked={codCollected}
              onChange={(e) => setCodCollected(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-300"
            />
            <span>
              I collected {formatPaise(codDuePaise)} in cash from the customer.
            </span>
          </label>
        )}
        {leg === "delivery" && !codDue && (
          <p className="rounded-xl bg-mist-100 px-3 py-2 text-sm text-ink-700">
            Nothing to collect — this order is already paid (or fully covered).
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-press w-full rounded-full bg-brand-600 px-5 py-3.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting
            ? "Recording…"
            : isPickup
              ? "Confirm pickup"
              : "Confirm delivery"}
        </button>
      </form>
    </section>
  );
}
