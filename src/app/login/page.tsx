"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/validation";
import { safeNextPath } from "@/lib/redirects";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

export default function LoginPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
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
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) {
        setFormError(error.message);
        return;
      }
      // Honour ?next= for safe local paths only (safeNextPath):
      // the staff shell sends unauthenticated riders here as
      // /login?next=/staff, and they should land back on /staff,
      // not the customer dashboard. No next (or an unsafe one)
      // keeps the long-standing default below.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(safeNextPath(next, "/dashboard"));
      router.refresh();
    } catch {
      setFormError("Login is not available yet. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        Log in to book pickups, follow your orders and manage your addresses.
      </p>

      {!configured && (
        <p role="status" className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-ink-700">
          Accounts are being set up. Login will open as soon as the service
          configuration is complete.
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-5">
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className={inputClass} aria-invalid={!!errors.email} />
          {errors.email && <p role="alert" className="mt-1 text-sm text-red-600">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" className={inputClass} aria-invalid={!!errors.password} />
          {errors.password && <p role="alert" className="mt-1 text-sm text-red-600">{errors.password}</p>}
          <p className="mt-2 text-right text-sm">
            <Link href="/forgot-password" className="font-semibold text-brand-700 hover:text-brand-800">
              Forgot password?
            </Link>
          </p>
        </div>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="btn-press rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-500">
        New to Z-clean?{" "}
        <Link href="/register" className="font-semibold text-brand-700 hover:text-brand-800">
          Create an account
        </Link>
      </p>
    </section>
  );
}
