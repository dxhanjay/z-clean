"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { addressSchema } from "@/lib/validation";
import { DEMO_CITY, isPincodeServiceable, serviceAreas } from "@/lib/pricing";
import { services } from "@/lib/services";
import {
  addDemoAddress,
  listDemoAddresses,
  listDemoPickups,
  type DemoAddress,
  type PickupRequest,
} from "@/lib/demo-store";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";
const labelClass = "block text-sm font-semibold text-ink-900";

interface LivePickup {
  id: string;
  services: string[];
  pickup_slot: string;
  delivery_type: string;
  status: string;
  area: string | null;
  city: string;
  pincode: string;
  created_at: string;
}

interface LiveAddress {
  id: string;
  label: string;
  line: string;
  area: string | null;
  city: string;
  pincode: string;
}

function serviceNames(slugs: string[]): string {
  return slugs
    .map((slug) => services.find((s) => s.slug === slug)?.name ?? slug)
    .join(", ");
}

function PickupCard({
  title,
  when,
  status,
  deliveryType,
  areaLine,
  serviceSlugs,
}: {
  title: string;
  when: string;
  status: string;
  deliveryType: string;
  areaLine: string;
  serviceSlugs: string[];
}) {
  return (
    <li className="rounded-[1.5rem] bg-white p-5 shadow-soft-sm ring-1 ring-mist-200/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-ink-900">{title}</p>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          {status.replaceAll("_", " ")}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-500">
        {serviceNames(serviceSlugs)} · {deliveryType === "express" ? "Express" : "Regular"}
      </p>
      <p className="text-sm text-ink-500">
        Pickup: {when} · {areaLine}
      </p>
    </li>
  );
}

export default function DashboardPanels({
  mode,
  signedIn,
}: {
  mode: "live" | "demo";
  signedIn: boolean;
}) {
  const [pickups, setPickups] = useState<LivePickup[]>([]);
  const [demoPickups, setDemoPickups] = useState<PickupRequest[]>([]);
  const [addresses, setAddresses] = useState<LiveAddress[]>([]);
  const [demoAddresses, setDemoAddresses] = useState<DemoAddress[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadLive = useCallback(async () => {
    try {
      const [pRes, aRes] = await Promise.all([
        fetch("/api/pickups"),
        fetch("/api/addresses"),
      ]);
      if (pRes.ok) {
        const json = await pRes.json();
        setPickups((json.pickups ?? []) as LivePickup[]);
      }
      if (aRes.ok) {
        const json = await aRes.json();
        setAddresses((json.addresses ?? []) as LiveAddress[]);
      }
    } catch {
      // Keep empty lists; the sections below explain themselves.
    }
  }, []);

  useEffect(() => {
    if (mode === "live" && signedIn) {
      void loadLive();
    } else {
      setDemoPickups(listDemoPickups());
      setDemoAddresses(listDemoAddresses());
    }
  }, [mode, signedIn, loadLive]);

  async function handleAddAddress(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      label: form.get("label"),
      line: form.get("line"),
      area: form.get("area"),
      city: form.get("city"),
      pincode: form.get("pincode"),
    };
    const parsed = addressSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (!isPincodeServiceable(parsed.data.pincode)) {
      setErrors({
        pincode:
          "Not serviceable yet — we serve Bokaro Steel City pincodes 827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014 and 829301.",
      });
      return;
    }
    setErrors({});
    setFormError("");
    setSaved(false);
    setSaving(true);
    try {
      if (mode === "live" && signedIn) {
        const res = await fetch("/api/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (json.fieldErrors) setErrors(json.fieldErrors);
          setFormError(json.error ?? "Could not save this address.");
          return;
        }
        await loadLive();
      } else {
        addDemoAddress(parsed.data);
        setDemoAddresses(listDemoAddresses());
      }
      setSaved(true);
      formEl.reset();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const hasPickups = mode === "live" ? pickups.length > 0 : demoPickups.length > 0;
  const hasAddresses =
    mode === "live" ? addresses.length > 0 : demoAddresses.length > 0;

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="my-pickups" className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
        <div className="flex items-center justify-between gap-3">
          <h2 id="my-pickups" className="font-bold text-ink-900">My pickup requests</h2>
          <Link href="/schedule-pickup" className="text-sm font-semibold text-brand-700 hover:underline">
            + New pickup
          </Link>
        </div>
        {hasPickups ? (
          <ul className="mt-4 grid gap-3">
            {mode === "live"
              ? pickups.map((p) => (
                  <PickupCard
                    key={p.id}
                    title={`Ref ${p.id.slice(0, 8).toUpperCase()}`}
                    when={new Date(p.pickup_slot).toLocaleString("en-IN")}
                    status={p.status}
                    deliveryType={p.delivery_type}
                    areaLine={`${p.area ?? ""}, ${p.city} — ${p.pincode}`}
                    serviceSlugs={p.services}
                  />
                ))
              : demoPickups.map((p) => (
                  <PickupCard
                    key={p.ref}
                    title={`Demo ref ${p.ref}`}
                    when={`${p.pickupDate} · ${p.pickupSlot}`}
                    status={p.status}
                    deliveryType={p.deliveryType}
                    areaLine={`${p.area}, ${p.city} — ${p.pincode}`}
                    serviceSlugs={p.services}
                  />
                ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            No pickup requests yet.{" "}
            <Link href="/schedule-pickup" className="font-semibold text-brand-700 hover:underline">
              Schedule your first pickup
            </Link>{" "}
            and it will appear here.
          </p>
        )}
      </section>

      <section aria-labelledby="my-addresses" className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
        <h2 id="my-addresses" className="font-bold text-ink-900">Saved addresses</h2>
        {hasAddresses && (
          <ul className="mt-4 grid gap-3">
            {(mode === "live"
              ? addresses.map((a) => ({
                  key: a.id,
                  label: a.label,
                  text: `${a.line}, ${a.area ?? ""}, ${a.city} — ${a.pincode}`,
                }))
              : demoAddresses.map((a) => ({
                  key: a.id,
                  label: a.label,
                  text: `${a.line}, ${a.area}, ${a.city} — ${a.pincode}`,
                }))
            ).map((row) => (
              <li key={row.key} className="rounded-2xl bg-mist-100 p-4">
                <p className="text-sm font-bold text-ink-900">{row.label}</p>
                <p className="text-sm text-ink-700">{row.text}</p>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAddAddress} noValidate className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="addr-label" className={labelClass}>Label</label>
              <input id="addr-label" name="label" placeholder="Home / Office" className={inputClass} aria-invalid={!!errors.label} />
              {errors.label && <p role="alert" className="mt-1 text-sm text-red-600">{errors.label}</p>}
            </div>
            <div>
              <label htmlFor="addr-pincode" className={labelClass}>Pincode</label>
              <input id="addr-pincode" name="pincode" inputMode="numeric" maxLength={6} placeholder="e.g. 827001" className={inputClass} aria-invalid={!!errors.pincode} />
              {errors.pincode && <p role="alert" className="mt-1 text-sm text-red-600">{errors.pincode}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="addr-line" className={labelClass}>Address</label>
            <input id="addr-line" name="line" placeholder="House / quarter no., street, landmark" className={inputClass} aria-invalid={!!errors.line} />
            {errors.line && <p role="alert" className="mt-1 text-sm text-red-600">{errors.line}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="addr-area" className={labelClass}>Area</label>
              <select id="addr-area" name="area" className={inputClass} aria-invalid={!!errors.area} defaultValue="">
                <option value="" disabled>Select your area</option>
                {serviceAreas.map((a) => (
                  <option key={`${a.area}-${a.pincode}`} value={a.area}>
                    {a.area} ({a.pincode})
                  </option>
                ))}
              </select>
              {errors.area && <p role="alert" className="mt-1 text-sm text-red-600">{errors.area}</p>}
            </div>
            <div>
              <label htmlFor="addr-city" className={labelClass}>City</label>
              <input id="addr-city" name="city" defaultValue={DEMO_CITY} className={inputClass} aria-invalid={!!errors.city} />
              {errors.city && <p role="alert" className="mt-1 text-sm text-red-600">{errors.city}</p>}
            </div>
          </div>
          {formError && <p role="alert" className="text-sm font-semibold text-red-600">{formError}</p>}
          {saved && (
            <p role="status" className="text-sm font-semibold text-green-700">
              Address saved{mode === "demo" ? " (demo — stored in this browser only)" : ""}.
            </p>
          )}
          <div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full border border-brand-200 px-5 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-brand-50 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Add address"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
