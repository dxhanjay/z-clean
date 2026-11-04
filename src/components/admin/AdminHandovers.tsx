"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPaise } from "@/lib/pricing";
import {
  HANDOVER_CHAIN,
  handoverFlagLabel,
  handoverPoint,
  receivingRoles,
  type HandoverPoint,
} from "@/lib/handovers";
import { staffRoleLabel, type Employee } from "@/lib/org";
import { listDemoEmployees } from "@/lib/demo-org";
import {
  applyDemoHandover,
  regenerateDemoOtp,
} from "@/lib/demo-handovers";

/**
 * Handover chain panel (Phase 8) — admin order detail.
 *
 * Shows the order's QR code, its OTP states, the completed chain, and
 * the NEXT point's completion card. Staff have no separate logins yet:
 * the operator works from this admin console and SELECTS the employee
 * who is physically receiving the items; the API (live) or the demo
 * applier (demo) validates that employee against the point's role,
 * the OTP/QR credential, the sequence and the lifecycle rules. The
 * copy below says this plainly — nothing pretends the employee
 * personally signed in.
 */

export interface HandoverView {
  id: string;
  pointId: string;
  fromStage: string;
  toStage: string;
  method: string;
  fromEmployeeName: string | null;
  toEmployeeName: string | null;
  quantity: number;
  expectedQuantity: number;
  flags: string[];
  note: string | null;
  at: string;
}

export interface OtpStateView {
  pickupSet: boolean;
  pickupUsedAt: string | null;
  deliverySet: boolean;
  deliveryUsedAt: string | null;
  attempts: number;
  locked: boolean;
}

interface Props {
  orderId: string;
  mode: "live" | "demo";
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  outstandingPaise: number;
  itemCount: number;
  qrPayload: string | null;
  otpState: OtpStateView | null;
  handovers: HandoverView[];
  nextPoint: HandoverPoint | null;
  onChanged: () => void;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminHandovers({
  orderId,
  mode,
  status,
  paymentMethod,
  paymentStatus,
  outstandingPaise,
  itemCount,
  qrPayload,
  otpState,
  handovers,
  nextPoint,
  onChanged,
}: Props) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [otp, setOtp] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [quantity, setQuantity] = useState(itemCount);
  const [codCollected, setCodCollected] = useState(false);
  const [missingItem, setMissingItem] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState<"pickup" | "delivery" | null>(null);

  /* Employees: live from the admin API; demo from the demo store. */
  useEffect(() => {
    if (mode === "demo") {
      setEmployees(listDemoEmployees());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/employees");
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.mode === "live") {
          setEmployees(json.employees as Employee[]);
        }
      } catch {
        // The select simply stays empty; the error surfaces on submit.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, handovers.length]);

  /* QR image of this order's payload. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!qrPayload) {
        setQrUrl(null);
        return;
      }
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(qrPayload, { width: 160, margin: 1 });
        if (!cancelled) setQrUrl(url);
      } catch {
        if (!cancelled) setQrUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  const eligible = useMemo(() => {
    if (!nextPoint) return [];
    const allowed = receivingRoles(nextPoint) as string[];
    return employees.filter(
      (e) =>
        e.employmentStatus === "active" &&
        e.roles.some((r) => allowed.includes(r)),
    );
  }, [employees, nextPoint]);

  /* Reset the form whenever the next point changes (incl. after a
     completion reloads the order into its next step). */
  useEffect(() => {
    setEmployeeId(eligible[0]?.id ?? "");
    setOtp("");
    setQrInput("");
    setQuantity(itemCount);
    setCodCollected(false);
    setMissingItem(false);
    setNote("");
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextPoint?.id, status]);

  useEffect(() => {
    if (employeeId === "" && eligible.length > 0) {
      setEmployeeId(eligible[0].id);
    }
  }, [eligible, employeeId]);

  const codCollectible =
    nextPoint?.id === "delivery" &&
    paymentMethod === "cod" &&
    paymentStatus === "cod_pending";

  const completedIds = useMemo(
    () => new Set(handovers.map((h) => h.pointId)),
    [handovers],
  );

  async function submit() {
    if (!nextPoint) return;
    setBusy(true);
    setFeedback(null);
    setFormError(null);
    const payload = {
      pointId: nextPoint.id,
      toEmployeeId: employeeId,
      method: nextPoint.method,
      otp: nextPoint.method === "otp" ? otp.trim() : undefined,
      qrToken: nextPoint.method === "qr" ? qrInput.trim() : undefined,
      quantity,
      codCollected: codCollectible && codCollected ? true : undefined,
      missingItem: missingItem || undefined,
      note: note.trim() || undefined,
    };
    try {
      if (mode === "demo") {
        const result = applyDemoHandover(orderId, payload);
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        setFeedback(
          `Handover recorded (demo) — ${nextPoint.label}.` +
            (result.nextPoint
              ? ` Next: ${result.nextPoint.label}.`
              : " The chain is complete."),
        );
        onChanged();
        return;
      }
      const res = await fetch(`/api/admin/orders/${orderId}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "The handover could not be recorded.");
        return;
      }
      setFeedback(
        `Handover recorded — ${nextPoint.label}.` +
          (json.nextPoint
            ? ` Next: ${(json.nextPoint as HandoverPoint).label}.`
            : " The chain is complete."),
      );
      onChanged();
    } catch {
      setFormError("The handover could not be recorded. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const regenerate = useCallback(
    async (which: "pickup" | "delivery") => {
      setRegenBusy(which);
      setFeedback(null);
      setFormError(null);
      try {
        if (mode === "demo") {
          const result = regenerateDemoOtp(orderId, which);
          if (!result.ok) {
            setFormError(result.error);
            return;
          }
          setFeedback(
            `New ${which} OTP (demo): ${result.otp} — the customer can also see it on their order page. Failed-attempt lock is cleared.`,
          );
          onChanged();
          return;
        }
        const res = await fetch(`/api/admin/orders/${orderId}/regenerate-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ which }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setFormError(json?.error ?? "The OTP could not be regenerated.");
          return;
        }
        setFeedback(
          `New ${which} OTP: ${json.otp} — the customer can also see it on their order page. Failed-attempt lock is cleared.`,
        );
        onChanged();
      } catch {
        setFormError("The OTP could not be regenerated. Please try again.");
      } finally {
        setRegenBusy(null);
      }
    },
    [mode, orderId, onChanged],
  );

  const otpRow = (
    kind: "pickup" | "delivery",
    set: boolean,
    usedAt: string | null,
  ) => {
    const pointDone = completedIds.has(kind === "pickup" ? "pickup" : "delivery");
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <p className="text-sm text-ink-700">
          <span className="font-semibold text-ink-900">
            {kind === "pickup" ? "Pickup" : "Delivery"} OTP
          </span>{" "}
          —{" "}
          {usedAt
            ? `used ${fmt(usedAt)}`
            : !set
              ? "not generated yet"
              : pointDone
                ? "used"
                : "waiting to be used"}
        </p>
        {(!set || otpState?.locked) && !pointDone && (
          <button
            type="button"
            disabled={regenBusy !== null}
            onClick={() => void regenerate(kind)}
            className="min-h-[44px] rounded-full border border-brand-300 px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
          >
            {regenBusy === kind
              ? "Generating…"
              : !set
                ? `Generate ${kind} OTP`
                : `Regenerate ${kind} OTP`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div id="handover" className="rounded-2xl border border-brand-100 p-4 sm:p-6">
      <h2 className="font-bold text-ink-900">Handover chain</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
        Every stage transfer is verified (customer OTP at the doorsteps,
        this order&apos;s QR code in between) and recorded against the
        employee who receives the items. Staff act from this admin
        console — employee logins are not enabled yet, so you select the
        receiving employee for each handover; the action is audit-logged
        under your admin account.
      </p>

      {feedback && (
        <p role="status" className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
          {feedback}
        </p>
      )}
      {formError && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
          {formError}
        </p>
      )}

      {/* Order QR + OTP states */}
      <div className="mt-4 flex flex-wrap gap-4 rounded-xl bg-brand-50/60 p-4">
        <div className="shrink-0">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="QR code for this order" className="h-32 w-32 rounded-lg bg-white p-1" />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-white p-2 text-center text-xs text-ink-500">
              {qrPayload ? "QR unavailable" : "No QR token on this order"}
            </div>
          )}
          <p className="mt-1.5 max-w-[140px] break-all text-[11px] leading-snug text-ink-500">
            {qrPayload ?? "—"}
          </p>
        </div>
        <div className="min-w-[220px] flex-1 divide-y divide-brand-100">
          {otpState ? (
            <>
              {otpRow("pickup", otpState.pickupSet, otpState.pickupUsedAt)}
              {otpRow("delivery", otpState.deliverySet, otpState.deliveryUsedAt)}
              <p className="py-2 text-xs text-ink-500">
                Failed OTP attempts: {otpState.attempts} / 5
                {otpState.locked
                  ? " — OTP verification is LOCKED until an OTP is regenerated."
                  : "."}{" "}
                The codes themselves are shown only to the customer, on
                their order page.
              </p>
            </>
          ) : (
            <p className="py-2 text-sm text-ink-500">OTP state unavailable.</p>
          )}
        </div>
      </div>

      {/* Completed chain */}
      {handovers.length > 0 ? (
        <ol className="mt-5 grid gap-3">
          {handovers.map((h) => {
            const point = handoverPoint(h.pointId);
            return (
              <li key={h.id} className="rounded-xl border border-brand-50 p-3 text-sm">
                <p className="font-semibold text-ink-900">
                  ✓ {point?.label ?? h.pointId}
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                    {h.method === "otp" ? "OTP" : "QR"}
                  </span>
                </p>
                <p className="mt-0.5 text-ink-500">
                  {h.fromEmployeeName ?? h.fromStage} →{" "}
                  {h.toEmployeeName ?? h.toStage} · {h.quantity} of{" "}
                  {h.expectedQuantity} item{h.expectedQuantity === 1 ? "" : "s"} ·{" "}
                  {fmt(h.at)}
                </p>
                {h.flags.length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {h.flags.map((f) => (
                      <span key={f} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                        ⚠ {handoverFlagLabel(f)}
                      </span>
                    ))}
                  </p>
                )}
                {h.note && <p className="mt-1 leading-relaxed text-ink-500">{h.note}</p>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-ink-500">No handovers recorded yet.</p>
      )}

      {/* Next point card */}
      {nextPoint ? (
        <form
          className="mt-5 rounded-xl border-2 border-brand-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h3 className="font-bold text-ink-900">
            Next: {nextPoint.label}
            <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              {nextPoint.method === "otp" ? "Verify by OTP" : "Verify by QR"}
            </span>
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            {nextPoint.fromLabel} hands over to a{" "}
            {receivingRoles(nextPoint).map(staffRoleLabel).join(" or ")}.
          </p>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-ink-900">Receiving employee</span>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="min-h-[44px] rounded-xl border border-brand-200 px-3 py-2.5 text-sm font-semibold text-ink-900"
              >
                {eligible.length === 0 && (
                  <option value="">No active employee with this role</option>
                )}
                {eligible.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeCode}) — {e.roles.map(staffRoleLabel).join(", ")}
                  </option>
                ))}
              </select>
              {eligible.length === 0 && (
                <span className="text-xs leading-relaxed text-red-600">
                  Add an active employee with the{" "}
                  {receivingRoles(nextPoint).map(staffRoleLabel).join(" or ")}{" "}
                  role on the Employees screen first.
                </span>
              )}
            </label>

            {nextPoint.method === "otp" ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold text-ink-900">
                  Customer&apos;s {nextPoint.otpKind} OTP
                </span>
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6-digit code from the customer"
                  className="min-h-[44px] rounded-xl border border-brand-200 px-3 py-2.5 text-sm tracking-[0.3em] text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none"
                />
              </label>
            ) : (
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold text-ink-900">Order QR code</span>
                <input
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="Scan the bag tag, or paste the order's QR payload / token"
                  className="min-h-[44px] rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none"
                />
                {qrPayload && (
                  <button
                    type="button"
                    onClick={() => setQrInput(qrPayload)}
                    className="justify-self-start text-xs font-semibold text-brand-700 hover:underline"
                  >
                    Use the code printed for this order (shown above)
                  </button>
                )}
              </label>
            )}

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-ink-900">
                Items handed over (expected {itemCount})
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="min-h-[44px] w-32 rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
              />
              <span className="text-xs text-ink-500">
                A different count still completes the handover — it is
                recorded with a quantity-mismatch flag for follow-up.
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={missingItem}
                onChange={(e) => setMissingItem(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
              />
              <span>Report a missing item (flagged on the handover, not a block)</span>
            </label>

            {codCollectible && (
              <label className="flex items-start gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={codCollected}
                  onChange={(e) => setCodCollected(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
                />
                <span>
                  The customer paid the outstanding {formatPaise(outstandingPaise)}{" "}
                  on delivery — record the Pay-on-Delivery collection with
                  this handover.
                </span>
              </label>
            )}

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-ink-900">Note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="e.g. One bag sealed separately"
                className="min-h-[44px] rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !employeeId}
              className="min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
            >
              {busy ? "Recording…" : "Complete handover"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-5 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-ink-700">
          {status === "DELIVERED"
            ? handovers.length >= HANDOVER_CHAIN.length
              ? "The handover chain ran end to end for this order."
              : "This order is marked delivered. Its handover chain was not fully recorded (the status may have been set directly)."
            : status === "CANCELLED"
              ? "This order was cancelled — no handovers apply."
              : "This order is not in the handover flow yet (it is waiting on payment)."}
        </p>
      )}
    </div>
  );
}
