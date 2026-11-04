import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminBranches from "@/components/admin/AdminBranches";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

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
    <>
      <AdminSectionHeader
        title="Branches & plants"
        subtitle="The physical units Z-clean runs from — the laundry plant, collection centers and branches. Each unit can have a manager from the employee list, and units you no longer use can be deactivated instead of deleted."
      />
      <AdminBranches mode={mode} />
    </>
  );
}
