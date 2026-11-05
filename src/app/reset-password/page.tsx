"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { parseLinkHash, resolveLinkSession } from "@/lib/link-session";
import { newPasswordSchema } from "@/lib/validation";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

type Phase = "checking" | "ready" | "invalid" | "done";

/**
 * Reset password (P0) — the landing page of the emailed reset link.
 *
 * The link carries a recovery session — as a ?code= the browser
 * client exchanges itself when the reset was requested through the
 * PKCE browser flow, or as implicit-flow tokens in the URL hash
 * when the link was sent by a non-PKCE client (the service-role
 * admin client, the Supabase dashboard…). The @supabase/ssr
 * browser client is pinned to PKCE and refuses implicit callbacks,
 * so the hash case never reaches getSession() on its own: this page
 * resolves the fragment itself via src/lib/link-session.ts
 * (existing session → form; fragment tokens → auth.setSession;
 * error fragment or nothing → invalid). Once a session exists we
 * show the new-password form and set the password through
 * auth.updateUser. No session after a grace period → the link was
 * invalid or expired, and we say so with a path back to
 * /forgot-password.
 */
export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    const supabase = createClient();
    const hash = window.location.hash;

    const markReady = () => {
      if (!cancelled) setPhase("ready");
    };
    const markInvalid = () => {
      if (!cancelled) {
        setPhase((current) => (current === "checking" ? "invalid" : current));
      }
    };
    const stripFragment = () => {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    };

    // An error fragment (error=access_denied&error_code=otp_expired…)
    // means the link failed — show the invalid state directly,
    // without waiting on any session machinery.
    if (parseLinkHash(hash).hasError) {
      stripFragment();
      setPhase("invalid");
      return;
    }

    // Belt and braces: a PKCE ?code= exchange completing after first
    // paint, or any other sign-in, still unlocks the form.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady();
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const action = resolveLinkSession({
        hasSession: !!data.session,
        hash,
      });
      if (action.kind === "ready") {
        markReady();
        return;
      }
      if (action.kind === "invalid") {
        markInvalid();
        return;
      }
      // Implicit-flow tokens from the reset link: the PKCE browser
      // client will not consume these itself, so hand them over.
      const { data: established, error } = await supabase.auth.setSession({
        access_token: action.accessToken,
        refresh_token: action.refreshToken,
      });
      // The tokens are single-use secrets — get them out of the URL.
      stripFragment();
      if (cancelled) return;
      if (!error && established.session) markReady();
      else markInvalid();
    })();

    const timer = setTimeout(markInvalid, 5000);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [configured]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const form = new FormData(e.currentTarget);
    const parsed = newPasswordSchema.safeParse({
      password: form.get("password"),
      confirmPassword: form.get("confirmPassword"),
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (error) {
        setFormError(error.message);
        return;
      }
      setPhase("done");
    } catch {
      setFormError("Could not update your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
        Set a new password
      </h1>

      {!configured && (
        <p role="status" className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-ink-700">
          Accounts are being set up. Password reset will open as soon as
          the service configuration is complete.
        </p>
      )}

      {configured && phase === "checking" && (
        <p role="status" className="mt-6 text-sm text-ink-500">
          Verifying your reset link…
        </p>
      )}

      {configured && phase === "invalid" && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm font-bold text-ink-900">This reset link is not valid</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            It may have expired or already been used. Request a fresh
            link and try again.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/forgot-password" className="font-semibold text-brand-700 hover:text-brand-800">
              Request a new reset link
            </Link>
          </p>
        </div>
      )}

      {configured && phase === "done" && (
        <div role="status" className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5">
          <p className="text-sm font-bold text-ink-900">Password updated</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            Your new password is set. You can now log in with it.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
              Go to log in
            </Link>
          </p>
        </div>
      )}

      {configured && phase === "ready" && (
        <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-5">
          <div>
            <label htmlFor="password" className={labelClass}>New password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p role="alert" className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>
          <div>
            <label htmlFor="confirmPassword" className={labelClass}>Confirm new password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={inputClass}
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <p role="alert" className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
            )}
          </div>
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="btn-press rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Updating…" : "Set new password"}
          </button>
        </form>
      )}
    </section>
  );
}
