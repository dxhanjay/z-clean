import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminReports from "@/components/admin/AdminReports";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Reports",
};

/**
 * Reports & analytics (Phase 9). The layout has already applied the
 * admin guard; here we only pick the data mode.
 */
export default async function AdminReportsPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Reports"
        subtitle="Sales, collections, plant throughput, pending-order aging, employee performance from the handover ledger, voucher usage, customer retention and expenses — every number computed from the live records, nothing estimated."
      />
      <AdminReports mode={mode} />
    </>
  );
}
