import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminCustomers from "@/components/admin/AdminCustomers";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Customers",
};

/**
 * Customer Management (Delta 1) — every account with order counts
 * and ledger-consistent lifetime spend. The layout has applied the
 * guard; here we only pick the data mode.
 */
export default async function AdminCustomersPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Customers"
        subtitle="Every Z-clean account — orders, lifetime spend (money actually collected, per the finance ledger) and account status. Open a customer to see addresses, recent orders and vouchers, or to disable an account."
      />
      <AdminCustomers mode={mode} />
    </>
  );
}
