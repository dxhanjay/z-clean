import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminFinance from "@/components/admin/AdminFinance";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Finance",
};

/**
 * Finance (Phase 9). The layout has already applied the admin guard;
 * here we only pick the data mode.
 */
export default async function AdminFinancePage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Finance"
        subtitle="The day's collections by method, the cash closing, who still owes what, refunds waiting for a decision, and the expenses ledger. Payments against an order are recorded on the order's own page; everything here is read from the same ledger."
      />
      <AdminFinance mode={mode} />
    </>
  );
}
