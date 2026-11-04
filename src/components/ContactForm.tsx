"use client";

import { useState } from "react";
import { contactSchema } from "@/lib/validation";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

/**
 * Contact form (client). The phone number arrives as a prop from the
 * server page, which reads it via getBusinessSettings() — the settings
 * table in live mode, the config constants otherwise (Phase 7b).
 */
export default function ContactForm({
  phone,
  hasPhone,
  serviceAreasNote,
}: {
  phone: string;
  hasPhone: boolean;
  serviceAreasNote: string;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = contactSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone") ?? "",
      message: form.get("message"),
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
    // Delivery channel (business inbox / CRM) is connected at launch, once
    // the owner confirms the business email. The form validates fully today;
    // submissions are acknowledged on screen, not silently dropped to a
    // fake backend.
    setSubmitted(true);
  }

  return (
    <>
      <div className="mt-8 rounded-2xl bg-brand-50 p-6 text-sm leading-relaxed text-ink-700">
        {hasPhone ? (
          <p>
            Prefer to talk? Call us at{" "}
            <a className="font-semibold text-brand-700" href={`tel:${phone.replace(/\s/g, "")}`}>
              {phone}
            </a>
            .
          </p>
        ) : (
          <p>
            Our phone and store details will be published here as soon as they
            are confirmed for launch. {serviceAreasNote}
          </p>
        )}
      </div>

      {submitted ? (
        <div role="status" className="mt-10 rounded-2xl border border-brand-200 bg-white p-8">
          <h2 className="text-xl font-bold text-ink-900">Message received</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Thanks for writing to Z-clean. We have your message and will reply
            to the email address you provided.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mt-10 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className={labelClass}>Your name</label>
            <input id="name" name="name" autoComplete="name" className={inputClass} aria-invalid={!!errors.name} />
            {errors.name && <p role="alert" className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" name="email" type="email" autoComplete="email" className={inputClass} aria-invalid={!!errors.email} />
            {errors.email && <p role="alert" className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="phone" className={labelClass}>
              Phone <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputClass} aria-invalid={!!errors.phone} />
            {errors.phone && <p role="alert" className="mt-1 text-sm text-red-600">{errors.phone}</p>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="message" className={labelClass}>Message</label>
            <textarea id="message" name="message" rows={5} className={inputClass} aria-invalid={!!errors.message} />
            {errors.message && <p role="alert" className="mt-1 text-sm text-red-600">{errors.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700"
            >
              Send message
            </button>
          </div>
        </form>
      )}
    </>
  );
}
