"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin security (MFA) card — TOTP enrollment & management (P0).
 *
 * Lives on Admin → Settings. Talks DIRECTLY to Supabase Auth from
 * the admin's own browser session (auth.mfa.*) — no server route is
 * involved, factors belong to the signed-in account, and the admin
 * layout independently checks the session's assurance level (AAL)
 * on every page load:
 *   - verified factor + AAL1 session → stepped up via /auth/mfa
 *   - no factor yet                  → allowed in, with a warning
 *     banner (this rollout never locks an admin out).
 *
 * Demo mode renders an explanatory, disabled card.
 */

interface Factor {
  id: string;
  status: string;
  friendly_name?: string | null;
  created_at?: string;
}

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";

export default function AdminMfa({ mode }: { mode: "demo" | "live" }) {
  const [loading, setLoading] = useState(mode === "live");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loadError, setLoadError] = useState("");
  const [enrollment, setEnrollment] = useState<{
    id: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [formError, setFormError] = useState("");

  const loadFactors = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setLoadError("Could not load your two-factor status.");
        return;
      }
      setFactors((data?.totp ?? []) as Factor[]);
    } catch {
      setLoadError("Could not load your two-factor status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "live") void loadFactors();
  }, [mode, loadFactors]);

  const verified = factors.find((f) => f.status === "verified");

  async function startEnroll() {
    setBusy(true);
    setFeedback("");
    setFormError("");
    try {
      const supabase = createClient();
      // Clear any half-finished (unverified) enrollments first —
      // Supabase refuses a second TOTP factor while one exists.
      for (const stale of factors.filter((f) => f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Z-clean admin",
      });
      if (error || !data) {
        setFormError(error?.message ?? "Could not start enrollment.");
        return;
      }
      setEnrollment({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch {
      setFormError("Could not start enrollment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    if (!enrollment) return;
    setBusy(true);
    setFeedback("");
    setFormError("");
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enrollment.id });
      if (challengeError || !challenge) {
        setFormError(challengeError?.message ?? "Could not start the confirmation challenge.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) {
        setFormError("That code was not accepted. Wait for a fresh code in the app and try again.");
        return;
      }
      setEnrollment(null);
      setFeedback("Two-factor authentication is now ON for your account. You will be asked for a code when you open the admin panel.");
      await loadFactors();
    } catch {
      setFormError("Could not confirm the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factorId: string) {
    setBusy(true);
    setFeedback("");
    setFormError("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        setFormError(error.message);
        return;
      }
      setFeedback("Two-factor authentication removed. You can re-enrol whenever you are ready.");
      await loadFactors();
    } catch {
      setFormError("Could not remove the factor. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 max-w-2xl rounded-2xl border border-admin-border bg-white p-5 sm:p-6" aria-label="Admin security — two-factor authentication">
      <h2 className="text-base font-extrabold tracking-tight text-ink-900">
        Admin security — two-factor authentication (MFA)
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
        Protect your admin account with a 6-digit code from an
        authenticator app (Google Authenticator, Microsoft
        Authenticator, Authy…). Once enabled, opening the admin panel
        asks for the code after you sign in.
      </p>

      {mode === "demo" ? (
        <p role="status" className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-ink-700">
          MFA is managed in live mode — sign in with the real admin
          account (Supabase connected) to enrol.
        </p>
      ) : loading ? (
        <p role="status" className="mt-4 text-sm text-ink-500">Loading your two-factor status…</p>
      ) : loadError ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{loadError}</p>
      ) : (
        <>
          <p className="mt-4 text-sm">
            <span className="font-semibold text-ink-900">Status: </span>
            {verified ? (
              <span className="font-bold text-green-700">Enabled</span>
            ) : (
              <span className="font-bold text-amber-700">Not enabled</span>
            )}
          </p>

          {feedback && (
            <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{feedback}</p>
          )}
          {formError && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{formError}</p>
          )}

          {verified && !enrollment && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeFactor(verified.id)}
              className="btn-press mt-5 min-h-[44px] rounded-full border border-red-200 px-5 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {busy ? "Removing…" : "Remove two-factor authentication"}
            </button>
          )}

          {!verified && !enrollment && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startEnroll()}
              className="btn-press mt-5 min-h-[44px] rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? "Starting…" : "Enable two-factor authentication"}
            </button>
          )}

          {enrollment && (
            <div className="mt-5 grid gap-4">
              <p className="text-sm leading-relaxed text-ink-700">
                1. Scan this QR code with your authenticator app (or add
                the secret manually), then enter the 6-digit code it
                shows to activate.
              </p>
              <div className="flex flex-wrap items-start gap-5">
                {/* Supabase returns the QR as an inline SVG data URI. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollment.qrCode}
                  alt="TOTP enrollment QR code"
                  width={176}
                  height={176}
                  className="rounded-xl border border-admin-border bg-white p-2"
                />
                <div className="min-w-[220px] flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Secret (manual entry)
                  </p>
                  <p className="mt-1 break-all rounded-lg bg-admin-panel px-3 py-2 font-mono text-sm text-ink-900">
                    {enrollment.secret}
                  </p>
                  <label className="mt-4 grid gap-1.5 text-sm">
                    <span className="font-semibold text-ink-900">2. Enter the 6-digit code</span>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="••••••"
                      className={inputClass}
                    />
                  </label>
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={busy || code.length !== 6}
                      onClick={() => void confirmEnroll()}
                      className="btn-press min-h-[44px] rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
                    >
                      {busy ? "Confirming…" : "Activate"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEnrollment(null)}
                      className="btn-press min-h-[44px] rounded-full border border-brand-200 px-5 py-2.5 text-sm font-bold text-ink-700 hover:bg-admin-panel disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
