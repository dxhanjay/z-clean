"use client";

import { useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { passwordResetRequestSchema } from "@/lib/validation";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

/**
 * Forgot password (P0). Submits to POST /api/auth/reset, which ALWAYS
 * answers { ok: true } — so this page shows the same "check your
 * inbox" state whether or not the email has an account. Nothing here
 * can be used to enumerate registered emails.
 */
export default function ForgotPasswordPage() {
  const [emailError, setEmailError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = passwordResetRequestSchema.safeParse({
      email: form.get("email"),
    });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setEmailError("");
    setSubmitting(true);
    try {
      await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.data.email }),
      });
    } catch {
      // Deliberately swallowed: the confirmation state is identical
      // either way (see the route's no-enumeration contract).
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
        Forgot your password?
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        Enter the email you signed up with and we will send you a link
        to set a new password.
      </p>

      {!configured && (
        <p role="status" className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-ink-700">
          Accounts are being set up. Password reset will open as soon as
          the service configuration is complete.
        </p>
      )}

      {sent ? (
        <div role="status" className="mt-8 rounded-xl border border-brand-200 bg-brand-50 p-5">
          <p className="text-sm font-bold text-ink-900">Check your inbox</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            If an account exists for that email, a password-reset link
            is on its way. The link takes you to a page where you can
            set a new password. If nothing arrives in a few minutes,
            check your spam folder.
          </p>
          <p className="mt-4 text-sm text-ink-500">
            <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
              Back to log in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-5">
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className={inputClass}
              aria-invalid={!!emailError}
            />
            {emailError && (
              <p role="alert" className="mt-1 text-sm text-red-600">{emailError}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn-press rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      {!sent && (
        <p className="mt-6 text-sm text-ink-500">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
            Back to log in
          </Link>
        </p>
      )}
    </section>
  );
}
