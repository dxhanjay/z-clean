import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffGate } from "@/lib/tracking-server";
import AmbientBackground from "@/components/AmbientBackground";
import StaffHeader from "@/components/staff/StaffHeader";

/**
 * Staff web app shell + gate (Staff Web App phase).
 *
 * Lives in the (app) route group on purpose: /staff/set-password —
 * the invite landing page — sits OUTSIDE this group, because an
 * invite session arrives in the URL hash where no server gate can
 * see it; gating that page here would bounce every new rider to the
 * login screen and break the invite flow.
 *
 * Gate (getStaffGate — assignment-based authorization):
 *   - unauthenticated → /login?next=/staff
 *   - staff role WITH a linked employee record → the app
 *   - admin tiers → the app in support mode (read-only: the task
 *     APIs let them view, never ping or hand over as a rider)
 *   - anyone else (customers, unlinked staff) → a plain-language
 *     notice; the tasks API independently enforces the same rule,
 *     so this screen is UX, not the security boundary.
 *
 * The shell is a tool, not a storefront: one slim top bar in the
 * storefront's pastel tokens, big touch targets, nothing else.
 *
 * Web3D UI pass (staff operability): the shell gains the marketing
 * site's glass language — the shared AmbientBackground mounted
 * HERE (the staff layout only; SiteChrome never mounts it on
 * /staff routes, and admin/customer shells are untouched), a
 * sticky header (StaffHeader — glass at the top, solid white once
 * scrolled, the marketing header's owner-approved rule), and a
 * glass sign-out pill. The gate states
 * (misconfigured / demo / forbidden) render BEFORE the shell and
 * stay plain on purpose: an error a rider must act on should
 * never sit behind frosted glass.
 */
export default async function StaffAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const gate = await getStaffGate();

  if (gate.kind === "unauthenticated") {
    redirect("/login?next=/staff");
  }

  if (gate.kind === "misconfigured") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
          Server configuration error
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          This deployment is missing its database configuration, so the
          staff app cannot load. No data is shown in this state.
        </p>
      </section>
    );
  }

  if (gate.kind === "demo") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
          Staff app needs the live service
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          This deployment is running in demo mode without the live
          database, so staff rounds cannot be shown. Riders use the
          staff app on the live Sri Clean site.
        </p>
      </section>
    );
  }

  if (gate.kind === "forbidden") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
          Staff access only
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          This area is for Sri Clean riders and field staff. Accounts are
          created by invitation from the office — if you work with us and
          expected access here, ask the office to send your invite, then
          open the link in that email.
        </p>
        <p className="mt-5 text-sm">
          <Link href="/account" className="font-semibold text-brand-700 hover:text-brand-800">
            Back to my account
          </Link>
        </p>
      </section>
    );
  }

  const displayName =
    gate.kind === "staff"
      ? gate.employee.fullName
      : (gate.employee?.fullName ?? "Office — support view");

  return (
    <div className="relative min-h-dvh">
      <AmbientBackground />
      <div className="relative">
        <StaffHeader
          displayName={displayName}
          supportView={gate.kind === "admin"}
        />
        <main className="relative mx-auto max-w-3xl px-4 py-5 pb-28 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
