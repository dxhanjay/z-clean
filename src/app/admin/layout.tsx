import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminGate } from "@/lib/admin";
import AdminShell from "@/components/admin/AdminShell";

/**
 * Admin guard (Phase 4) for /admin and everything under it.
 *
 * - DEMO MODE (Supabase not configured, demo legitimately active):
 *   the panel is reachable, but every admin screen sits under this
 *   prominent banner and works only on this browser's demo-store
 *   data. The two modes are never blurred.
 * - MISCONFIGURED (P0): a production build without Supabase env vars
 *   and without the demo flag renders a configuration-error screen —
 *   demo data is never presented as if it were real.
 * - LIVE MODE: a signed-in user is required (else redirect to /login),
 *   and profiles.role must be 'admin' — anyone else gets a plain 403
 *   screen and the children never render.
 * - MFA (P0): a signed-in admin WITH a verified TOTP factor whose
 *   session is still AAL1 is redirected to /auth/mfa to step up.
 *   Admins with NO factor are never locked out — the shell shows a
 *   dismissible "enable MFA" banner instead. (API routes keep the
 *   role-only gate in this phase; see README "Security".)
 *
 * Admin redesign: allowed screens render inside AdminShell (sidebar +
 * topbar console chrome). The gate decisions above are unchanged.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const gate = await getAdminGate();

  if (gate.kind === "unauthenticated") {
    redirect("/login");
  }

  if (gate.kind === "misconfigured") {
    return (
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
          Server configuration error
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          This deployment is missing its database configuration
          (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY),
          so the admin panel cannot load. No data is shown in this
          state. If you operate this site, set the environment
          variables and redeploy — or set NEXT_PUBLIC_DEMO_MODE=true
          to run the clearly-labelled demo deliberately.
        </p>
      </section>
    );
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

  // MFA step-up (live admins only): a verified factor + an AAL1
  // session means the second factor has not been presented yet.
  let mfaWarning = false;
  if (gate.kind === "ok") {
    const { data: aal } =
      await gate.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      redirect("/auth/mfa?next=/admin");
    }
    mfaWarning = aal?.nextLevel !== "aal2";
  }

  return (
    <AdminShell
      email={gate.kind === "ok" ? gate.user.email ?? null : null}
      mfaWarning={mfaWarning}
    >
      {gate.kind === "demo" && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p role="status" className="text-sm font-bold text-amber-900">
            DEMO MODE — admin panel. This demo is not connected to a live
            database, so you are managing the demo orders and pickup
            requests stored in THIS browser only. Nothing here affects
            real customers.
          </p>
        </div>
      )}
      {children}
    </AdminShell>
  );
}
