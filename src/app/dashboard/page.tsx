import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data-mode";
import DashboardPanels from "@/components/dashboard/DashboardPanels";
import OrdersSection from "@/components/dashboard/OrdersSection";

export const metadata: Metadata = {
  title: "My Dashboard",
};

/**
 * Customer dashboard (Phase 2).
 *
 * Two honest modes, always labelled:
 * - LIVE: Supabase configured + user signed in → pickup requests and
 *   addresses come from the RLS-protected tables via /api routes.
 * - DEMO: Supabase not configured (or nobody signed in) → the page does NOT
 *   redirect away; it renders in DEMO MODE showing pickup requests and
 *   addresses stored in this browser's localStorage, badged as demo.
 */
export default async function DashboardPage() {
  // P0 fail-closed: a production build without Supabase configuration
  // shows a configuration error — never the demo dashboard.
  if (getDataMode() === "misconfigured") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
          Service configuration error
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          This deployment is missing its database configuration, so
          your dashboard cannot load. No data is shown in this state.
          Please try again later, or contact us if it persists.
        </p>
      </section>
    );
  }

  const supabase = await createClient();

  let user: { email?: string; user_metadata?: { full_name?: string } } | null =
    null;
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  const live = Boolean(supabase && user);
  const displayName =
    user?.user_metadata?.full_name ?? user?.email ?? "Guest (demo)";

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
        Namaste, {displayName}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        Your pickup requests and saved addresses for Sri Clean in Bokaro Steel
        City, in one place.
      </p>

      {!live && (
        <div
          role="status"
          className="mt-6 rounded-[1.5rem] border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900"
        >
          DEMO MODE — {supabase
            ? "you are not signed in, so this dashboard shows demo data stored in this browser only."
            : "this demo is not connected to a live account system, so this dashboard shows data stored in this browser only."}{" "}
          {supabase && !user && (
            <Link href="/login" className="underline">Sign in</Link>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
          <h2 className="font-bold text-ink-900">Schedule a pickup</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Book a doorstep pickup in a couple of minutes.
          </p>
          <Link
            href="/schedule-pickup"
            className="btn-press mt-4 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Schedule pickup
          </Link>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
          <h2 className="font-bold text-ink-900">Pricing</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Draft demo rates for Bokaro Steel City, confirmed at pickup.
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-block rounded-full border border-brand-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-brand-50"
          >
            See price list
          </Link>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
          <h2 className="font-bold text-ink-900">Place an order</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            Choose items, see the exact total, and pay online or on delivery.
          </p>
          <Link
            href="/order"
            className="btn-press mt-4 inline-block rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Order now
          </Link>
        </div>
      </div>

      <OrdersSection mode={live ? "live" : "demo"} signedIn={Boolean(user)} />

      <DashboardPanels mode={live ? "live" : "demo"} signedIn={Boolean(user)} />

      {user && (
        <form action="/auth/signout" method="post" className="mt-10">
          <button
            type="submit"
            className="rounded-full border border-brand-200 px-5 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-brand-50"
          >
            Log out
          </button>
        </form>
      )}
    </section>
  );
}
