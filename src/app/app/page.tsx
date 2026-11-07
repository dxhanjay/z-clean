import type { Metadata } from "next";
import Link from "next/link";
import { businessSettings } from "@/lib/config";

export const metadata: Metadata = {
  title: "Get the App",
  description:
    "Get the Sri Clean app: book pickups, track your order stage by stage, and keep your QR and OTP handover codes in your pocket.",
};

/**
 * Get the App (Phase A) — an honest download page. The Android app is
 * distributed as preview builds from the project's Expo builds page;
 * the iOS App Store release is still being prepared, and this page
 * says exactly that instead of showing a dead store badge.
 */

const EXPO_BUILDS_URL =
  "https://expo.dev/accounts/dhananjaydev81/projects/z-clean/builds";

const appPoints = [
  {
    title: "Track every stage",
    text: "Your order's status moves with your clothes, from pickup to delivery — the same live timeline as your account here.",
  },
  {
    title: "Codes in your pocket",
    text: "Pickup and delivery are verified with your order's QR code and OTPs, right there in the app when the rider arrives.",
  },
  {
    title: "Book in a minute",
    text: "Reorder your usual services, pick a slot, and pay online or on delivery — no phone call needed.",
  },
];

export default function GetTheAppPage() {
  return (
    <section className="bg-pastel-hero">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
          {businessSettings.name} app
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
          Sri Clean, in your pocket
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
          The same account, orders and prices as this website — in an app
          built for the doorstep moments: booking a pickup, showing your
          handover code, and watching your laundry come home.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-[2rem] bg-white p-8 shadow-soft ring-1 ring-mist-200/70">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
              Android
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900">
              Download the Android app
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              The Android app is available now as a direct install from
              our builds page. Open it, choose the newest build, and
              follow the install prompt — order updates by push
              notification included.
            </p>
            <a
              href={EXPO_BUILDS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press mt-6 inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-soft transition-colors hover:bg-brand-700"
            >
              Download for Android
            </a>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Opens our Expo builds page in a new tab.
            </p>
          </div>

          <div className="rounded-[2rem] bg-white/70 p-8 shadow-soft ring-1 ring-mist-200/70">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
              iPhone &amp; iPad
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-900">
              iOS — coming soon
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              We&apos;re preparing the App Store release. Until it lands,
              everything works in your phone&apos;s browser — sign in,
              book and track exactly as in the app. Add this site to your
              home screen for one-tap access.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-block rounded-full border border-brand-200 bg-white px-6 py-3 text-sm font-bold text-brand-800 transition-colors hover:bg-brand-50"
            >
              Open the web app
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {appPoints.map((point) => (
            <div
              key={point.title}
              className="glass-panel rounded-[2rem] p-6 shadow-soft-sm ring-1 ring-white/60"
            >
              <h2 className="font-bold text-ink-900">{point.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {point.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
