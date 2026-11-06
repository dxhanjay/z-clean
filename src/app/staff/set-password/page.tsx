"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { parseLinkHash, resolveLinkSession } from "@/lib/link-session";
import { newPasswordSchema } from "@/lib/validation";
import StaffSuccessCheck from "@/components/staff/StaffSuccessCheck";

const inputClass =
  "min-h-12 w-full rounded-xl border border-brand-200 bg-white/90 px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

type Phase = "checking" | "ready" | "invalid" | "done";

/**
 * Staff invite landing — where the Supabase invite email's link
 * lands (POST /api/admin/employees/[id]/invite sends
 * inviteUserByEmail with redirectTo = .../staff/set-password).
 *
 * The invite link carries a session exactly like a recovery link, so
 * this page mirrors /reset-password: establish the session, then
 * set the password through auth.updateUser. The employee record was
 * already linked (employees.user_id + profiles.role='staff') by the
 * invite endpoint, so once the password is set the rider can open
 * /staff and see their assignments.
 *
 * Session establishment is NOT just "wait for the client": GoTrue
 * verifies the link and redirects back with implicit-flow tokens in
 * the URL fragment, but the @supabase/ssr browser client is pinned
 * to PKCE and refuses implicit callbacks — so this page resolves
 * the fragment itself via src/lib/link-session.ts (existing session
 * → form; fragment tokens → auth.setSession; error fragment or
 * nothing → invalid). See that module for the full post-mortem.
 *
 * SETUP: this URL must be on the Supabase Auth redirect allowlist
 * (Authentication → URL Configuration), the same place /reset-password
 * was added — without that, the invite link lands on the site root
 * instead and the session never reaches this page.
 *
 * Web3D UI pass: this page keeps the storefront chrome (see
 * SiteChrome), so it gains the marketing ambient backdrop for
 * free; its status panels become glass, the done state gains the
 * animated staff success check, and inputs/submit get 48px touch
 * targets. The session-resolution logic above is untouched —
 * presentation only.
 */
export default function StaffSetPasswordPage() {
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
      // Implicit-flow tokens from the invite link: the PKCE browser
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
      setFormError("Could not set your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">
        Z-clean Staff
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">
        Welcome to the team — set your password
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-700">
        You have been invited to the Z-clean staff app, where your pickup
        and delivery rounds will appear. Choose a password to finish
        setting up your account.
      </p>

      {!configured && (
        <p role="status" className="glass mt-6 rounded-[1.75rem] p-4 text-sm text-ink-700">
          Accounts are being set up. Staff sign-in will open as soon as
          the service configuration is complete.
        </p>
      )}

      {configured && phase === "checking" && (
        <p role="status" className="mt-6 text-sm text-ink-500">
          Verifying your invite link…
        </p>
      )}

      {configured && phase === "invalid" && (
        <div role="alert" className="mt-6 rounded-[1.75rem] border border-red-200 bg-red-50/95 p-5">
          <p className="text-sm font-bold text-ink-900">This invite link is not valid</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            It may have expired or already been used. If you already set
            a password, just sign in. Otherwise ask the Z-clean office
            to send you a fresh invite.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
              Go to log in
            </Link>
          </p>
        </div>
      )}

      {configured && phase === "done" && (
        <div role="status" className="glass-strong mt-6 rounded-[1.75rem] p-5">
          <StaffSuccessCheck size={44} />
          <p className="mt-3 text-sm font-bold text-ink-900">Password set — you are ready</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            Your staff account is active. Open the staff app to see the
            pickups and deliveries assigned to you.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/staff" className="font-semibold text-brand-700 hover:text-brand-800">
              Open the staff app
            </Link>
          </p>
        </div>
      )}

      {configured && phase === "ready" && (
        <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-5">
          <div>
            <label htmlFor="password" className={labelClass}>Your password</label>
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
            <label htmlFor="confirmPassword" className={labelClass}>Confirm password</label>
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
            className="btn-press min-h-12 rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Setting…" : "Set password & continue"}
          </button>
        </form>
      )}
    </section>
  );
}
