"use client";

import { useRef, useState } from "react";
import { formatPaise } from "@/lib/pricing";
import { otpApplyInput } from "@/lib/motion";

/** Spinner shown inside the submit button while the handover posts. */
function SubmitSpinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="staff-spinner h-4 w-4"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
 *
 * Web3D UI pass: glass panel over the staff shell's ambient
 * backdrop; the OTP is six 52px boxes with auto-advance, paste
 * support and backspace-to-previous (the digit rules are pure —
 * otpApplyInput in motion.ts §5) that JOIN into the same `otp`
 * string the submit has always sent; the submit shows
 * a spinner while recording, then the page's animated success
 * state takes over. The POST body is byte-for-byte the old one.
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
  const [boxes, setBoxes] = useState<string[]>(["", "", "", "", "", ""]);
  const otp = boxes.join("");
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [quantity, setQuantity] = useState("");
  const [missingItem, setMissingItem] = useState(false);
  const [codCollected, setCodCollected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPickup = leg === "pickup";
  const codDue = codDuePaise !== null && codDuePaise > 0;

  function applyOtpInput(index: number, rawValue: string) {
    const { boxes: next, focusIndex } = otpApplyInput(boxes, index, rawValue);
    setBoxes(next);
    if (focusIndex !== index) boxRefs.current[focusIndex]?.focus();
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const target = e.target as HTMLInputElement;
    const index = Number(target.dataset.otpIndex ?? 0);
    applyOtpInput(index, e.clipboardData.getData("text"));
  }

  function handleOtpKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (e.key === "Backspace" && boxes[index] === "" && index > 0) {
      e.preventDefault();
      boxRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      boxRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < boxes.length - 1) {
      boxRefs.current[index + 1]?.focus();
    }
  }

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
    <section id="staff-handover-panel" className="glass-strong rounded-[1.75rem] p-5 shadow-soft-lg ring-1 ring-ink-900/10">
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
          <span id="handover-otp-label" className="block text-sm font-semibold text-ink-900">
            Customer&apos;s 6-digit code
          </span>
          <div
            role="group"
            aria-labelledby="handover-otp-label"
            className="mt-1.5 flex justify-between gap-2"
          >
            {boxes.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxRefs.current[i] = el;
                }}
                data-otp-index={i}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Code digit ${i + 1} of 6`}
                maxLength={1}
                value={digit}
                onChange={(e) => applyOtpInput(i, e.target.value)}
                onPaste={handleOtpPaste}
                onKeyDown={(e) => handleOtpKeyDown(e, i)}
                onFocus={(e) => e.target.select()}
                className="h-[52px] w-full min-w-0 flex-1 rounded-xl border border-mist-300 bg-white/90 text-center text-2xl font-extrabold text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            ))}
          </div>
          {/* Screen-reader equivalent of the old single field: the
              six boxes join into exactly this string on submit. */}
          <span className="sr-only" aria-live="polite">
            {otp.length === 6
              ? "Code complete"
              : `${otp.length} of 6 digits entered`}
          </span>
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
            className="mt-1.5 min-h-12 w-full rounded-xl border border-mist-300 bg-white/90 px-4 py-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
          />
        </div>

        <label className="flex min-h-12 items-start gap-2.5 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={missingItem}
            onChange={(e) => setMissingItem(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-mist-300"
          />
          <span>
            Something is missing or short — the office will be told to
            reconcile this order.
          </span>
        </label>

        {leg === "delivery" && codDue && (
          <label className="flex min-h-12 items-start gap-2.5 rounded-xl bg-amber-50/90 px-3 py-2.5 text-sm font-semibold text-amber-900">
            <input
              type="checkbox"
              checked={codCollected}
              onChange={(e) => setCodCollected(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-amber-300"
            />
            <span>
              I collected {formatPaise(codDuePaise)} in cash from the customer.
            </span>
          </label>
        )}
        {leg === "delivery" && !codDue && (
          <p className="rounded-xl bg-white/70 px-3 py-2 text-sm text-ink-700">
            Nothing to collect — this order is already paid (or fully covered).
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50/95 px-3 py-2 text-sm font-semibold text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-press flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <SubmitSpinner />
              Recording…
            </>
          ) : isPickup ? (
            "Confirm pickup"
          ) : (
            "Confirm delivery"
          )}
        </button>
      </form>
    </section>
  );
}
