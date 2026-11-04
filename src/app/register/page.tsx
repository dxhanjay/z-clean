"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { registerSchema } from "@/lib/validation";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

export default function RegisterPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    const form = new FormData(e.currentTarget);
    const parsed = registerSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
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
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { full_name: parsed.data.name, phone: parsed.data.phone },
        },
      });
      if (error) {
        setFormError(error.message);
        return;
      }
      if (data.session) {
        router.push("/dashboard");
        router.refresh();
      } else {
        // Email confirmation enabled on the Supabase project.
        setNotice(
          "Account created. Check your email to confirm your address, then log in.",
        );
      }
    } catch {
      setFormError("Registration is not available yet. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Create your account</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        One account for pickups, payments and tracking — set up in a minute.
      </p>

      {!configured && (
        <p role="status" className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-ink-700">
          Accounts are being set up. Registration will open as soon as the
          service configuration is complete.
        </p>
      )}

      {notice ? (
        <div role="status" className="mt-8 rounded-2xl border border-brand-200 bg-white p-6">
          <h2 className="font-bold text-ink-900">You are on your way</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">{notice}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-brand-700">
            Go to login →
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-5">
          <div>
            <label htmlFor="name" className={labelClass}>Full name</label>
            <input id="name" name="name" autoComplete="name" className={inputClass} aria-invalid={!!errors.name} />
            {errors.name && <p role="alert" className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" name="email" type="email" autoComplete="email" className={inputClass} aria-invalid={!!errors.email} />
            {errors.email && <p role="alert" className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>Phone</label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputClass} aria-invalid={!!errors.phone} />
            {errors.phone && <p role="alert" className="mt-1 text-sm text-red-600">{errors.phone}</p>}
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" name="password" type="password" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.password} />
            {errors.password && <p role="alert" className="mt-1 text-sm text-red-600">{errors.password}</p>}
            <p className="mt-1 text-xs text-ink-500">At least 8 characters.</p>
          </div>
          <div>
            <label htmlFor="confirmPassword" className={labelClass}>Confirm password</label>
            <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.confirmPassword} />
            {errors.confirmPassword && <p role="alert" className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>}
          </div>
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="btn-press rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
          Log in
        </Link>
      </p>
    </section>
  );
}
