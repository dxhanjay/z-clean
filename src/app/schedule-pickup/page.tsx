"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { pickupRequestSchema, PICKUP_SLOTS } from "@/lib/validation";
import { services } from "@/lib/services";
import {
  DEMO_CITY,
  areasForPincode,
  formatInr,
  isPincodeServiceable,
  pricingTerms,
  serviceAreas,
} from "@/lib/pricing";
import { addDemoPickup, type PickupRequest } from "@/lib/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

const demoModeDefault = !isSupabaseConfigured();

function todayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

type Confirmation =
  | { kind: "live"; ref: string }
  | { kind: "demo"; ref: string };

export default function SchedulePickupPage() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [pincode, setPincode] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [demoMode] = useState(demoModeDefault);

  const pincodeValid = /^\d{6}$/.test(pincode);
  const pincodeServiceable = pincodeValid && isPincodeServiceable(pincode);
  const areaOptions = useMemo(
    () => (pincodeServiceable ? areasForPincode(pincode) : serviceAreas),
    [pincode, pincodeServiceable],
  );

  function toggleService(slug: string) {
    setSelectedServices((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      phone: form.get("phone"),
      addressLine: form.get("addressLine"),
      area: form.get("area"),
      city: form.get("city"),
      pincode: form.get("pincode"),
      services: selectedServices,
      pickupDate: form.get("pickupDate"),
      pickupSlot: form.get("pickupSlot"),
      deliveryType: form.get("deliveryType"),
      note: form.get("note") ?? "",
    };

    const parsed = pickupRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setFormError("");
      return;
    }
    if (!isPincodeServiceable(parsed.data.pincode)) {
      setErrors({
        pincode:
          "Not serviceable yet — we currently serve Bokaro Steel City pincodes 827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014 and 829301.",
      });
      return;
    }

    setErrors({});
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = (await res.json().catch(() => ({}))) as {
        mode?: string;
        ref?: string;
        error?: string;
        fieldErrors?: Record<string, string>;
      };

      if (res.status === 503 && json.mode === "demo") {
        // DEMO MODE: no server configured — store locally and say so.
        const record: PickupRequest = addDemoPickup({
          name: parsed.data.name,
          phone: parsed.data.phone,
          addressLine: parsed.data.addressLine,
          area: parsed.data.area,
          city: parsed.data.city,
          pincode: parsed.data.pincode,
          services: parsed.data.services,
          pickupDate: parsed.data.pickupDate,
          pickupSlot: parsed.data.pickupSlot,
          deliveryType: parsed.data.deliveryType,
          note: parsed.data.note || undefined,
        });
        setConfirmation({ kind: "demo", ref: record.ref });
        return;
      }
      if (!res.ok) {
        if (json.fieldErrors) setErrors(json.fieldErrors);
        setFormError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setConfirmation({ kind: "live", ref: json.ref ?? "" });
    } catch {
      setFormError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div role="status" className="rounded-2xl border border-brand-200 bg-white p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
            Pickup scheduled
          </h1>
          {confirmation.kind === "demo" ? (
            <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
              <strong>DEMO MODE:</strong> this demo site is not connected to a
              live booking system, so your request was saved only in this
              browser (demo reference <strong>{confirmation.ref}</strong>).
              No pickup has been booked with a real store.
            </div>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Your pickup request is saved. Reference:{" "}
              <strong>{confirmation.ref}</strong>. We will call to confirm
              before our pickup partner arrives.
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/order"
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
            >
              Add items &amp; place your order
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-ink-700 hover:bg-brand-50"
            >
              View my dashboard
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-ink-700 hover:bg-brand-50"
            >
              See prices
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
        Schedule a pickup
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
        Tell us where and when. We collect from your doorstep in {DEMO_CITY},
        confirm the final price at pickup, and deliver back fresh — free
        pickup &amp; delivery on orders of {formatInr(pricingTerms.freeDeliveryThresholdInr)} or
        more (minimum order {formatInr(pricingTerms.minimumOrderInr)}).
      </p>

      {demoMode && (
        <div role="status" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          DEMO MODE — this demo is not connected to a live booking system.
          Requests are saved in your browser only and no real pickup is booked.
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-10 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <input id="name" name="name" autoComplete="name" className={inputClass} aria-invalid={!!errors.name} />
          {errors.name && <p role="alert" className="mt-1 text-sm text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>Mobile number</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="10-digit mobile" className={inputClass} aria-invalid={!!errors.phone} />
          {errors.phone && <p role="alert" className="mt-1 text-sm text-red-600">{errors.phone}</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="addressLine" className={labelClass}>Pickup address</label>
          <input id="addressLine" name="addressLine" autoComplete="street-address" placeholder="House / quarter no., street, landmark" className={inputClass} aria-invalid={!!errors.addressLine} />
          {errors.addressLine && <p role="alert" className="mt-1 text-sm text-red-600">{errors.addressLine}</p>}
        </div>
        <div>
          <label htmlFor="pincode" className={labelClass}>Pincode</label>
          <input
            id="pincode"
            name="pincode"
            inputMode="numeric"
            maxLength={6}
            placeholder="e.g. 827004"
            className={inputClass}
            aria-invalid={!!errors.pincode}
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
          />
          {pincodeValid && !pincodeServiceable && (
            <p role="alert" className="mt-1 text-sm font-semibold text-red-600">
              Sorry — this pincode is not serviceable yet. We currently serve
              827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014 and 829301 in Bokaro Steel City.
            </p>
          )}
          {pincodeServiceable && (
            <p className="mt-1 text-sm font-semibold text-green-700">Good news — we serve this pincode.</p>
          )}
          {errors.pincode && <p role="alert" className="mt-1 text-sm text-red-600">{errors.pincode}</p>}
        </div>
        <div>
          <label htmlFor="area" className={labelClass}>Area</label>
          <select id="area" name="area" className={inputClass} aria-invalid={!!errors.area} defaultValue="">
            <option value="" disabled>Select your area</option>
            {areaOptions.map((a) => (
              <option key={`${a.area}-${a.pincode}`} value={a.area}>
                {a.area} ({a.pincode})
              </option>
            ))}
          </select>
          {errors.area && <p role="alert" className="mt-1 text-sm text-red-600">{errors.area}</p>}
        </div>
        <div>
          <label htmlFor="city" className={labelClass}>City</label>
          <input id="city" name="city" defaultValue={DEMO_CITY} className={inputClass} aria-invalid={!!errors.city} />
          {errors.city && <p role="alert" className="mt-1 text-sm text-red-600">{errors.city}</p>}
        </div>
        <div>
          <label htmlFor="pickupDate" className={labelClass}>Pickup date</label>
          <input id="pickupDate" name="pickupDate" type="date" min={todayStr()} className={inputClass} aria-invalid={!!errors.pickupDate} />
          {errors.pickupDate && <p role="alert" className="mt-1 text-sm text-red-600">{errors.pickupDate}</p>}
        </div>
        <div>
          <label htmlFor="pickupSlot" className={labelClass}>Pickup time slot</label>
          <select id="pickupSlot" name="pickupSlot" className={inputClass} aria-invalid={!!errors.pickupSlot} defaultValue="">
            <option value="" disabled>Select a slot</option>
            {PICKUP_SLOTS.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
          {errors.pickupSlot && <p role="alert" className="mt-1 text-sm text-red-600">{errors.pickupSlot}</p>}
        </div>
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>Delivery speed</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm text-ink-700">
              <input type="radio" name="deliveryType" value="regular" defaultChecked />
              Regular — standard price (Laundry 48 hrs · Dry Clean 72 hrs)
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm text-ink-700">
              <input type="radio" name="deliveryType" value="express" />
              Express — same/next day at {pricingTerms.expressMultiplier}× price
            </label>
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>Services you need</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.slug} className="flex cursor-pointer items-center gap-2 rounded-xl border border-brand-200 px-4 py-3 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={selectedServices.includes(s.slug)}
                  onChange={() => toggleService(s.slug)}
                />
                {s.name}
              </label>
            ))}
          </div>
          {errors.services && <p role="alert" className="mt-1 text-sm text-red-600">{errors.services}</p>}
        </fieldset>
        <div className="sm:col-span-2">
          <label htmlFor="note" className={labelClass}>
            Note <span className="font-normal text-ink-500">(optional — gate, landmark, special care)</span>
          </label>
          <textarea id="note" name="note" rows={3} maxLength={500} className={inputClass} />
        </div>
        {formError && (
          <p role="alert" className="text-sm font-semibold text-red-600 sm:col-span-2">{formError}</p>
        )}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Scheduling…" : "Schedule pickup"}
          </button>
        </div>
      </form>
    </section>
  );
}
