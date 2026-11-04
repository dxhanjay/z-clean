import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin";
import AdminNav from "@/components/admin/AdminNav";

/**
 * Admin guard (Phase 4) for /admin and everything under it.
 *
 * - DEMO MODE (Supabase not configured): the panel is reachable, but
 *   every admin screen sits under this prominent banner and works only
 *   on this browser's demo-store data. The two modes are never blurred.
 * - LIVE MODE: a signed-in user is required (else redirect to /login),
 *   and profiles.role must be 'admin' — anyone else gets a plain 403
 *   screen and the children never render.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const gate = await getAdminGate();

  if (gate.kind === "unauthenticated") {
    redirect("/login");
  }

  if (gate.kind === "forbidden") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
          403 — Admin access required
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          You are signed in as {gate.user.email ?? "a customer"}, and this
          account is not an admin. If you run Z-clean operations, sign in
          with the admin account (an admin can grant the role from the
          database — see the README, “Setup”, step 3).
        </p>
      </section>
    );
  }

  return (
    <>
      {gate.kind === "demo" && (
        <div className="border-b border-amber-300 bg-amber-50">
          <p
            role="status"
            className="mx-auto max-w-6xl px-4 py-3 text-sm font-bold text-amber-900 sm:px-6"
          >
            DEMO MODE — admin panel. This demo is not connected to a live
            database, so you are managing the demo orders and pickup
            requests stored in THIS browser only. Nothing here affects
            real customers.
          </p>
        </div>
      )}
      <AdminNav />
      {children}
    </>
  );
}
