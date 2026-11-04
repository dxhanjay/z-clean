import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminBranches from "@/components/admin/AdminBranches";

export const metadata: Metadata = {
  title: "Admin — Branches",
};

/**
 * Branches, plants & collection centers (Phase 7a). The layout has
 * already applied the admin guard; here we only pick the data mode.
 */
export default async function AdminBranchesPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Branches &amp; plants
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        The physical units Z-clean runs from — the laundry plant,
        collection centers and branches. Each unit can have a manager
        from the employee list, and units you no longer use can be
        deactivated instead of deleted.
      </p>
      <AdminBranches mode={mode} />
    </section>
  );
}
