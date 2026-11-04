import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Dashboard",
};

/**
 * Admin dashboard (admin redesign) — the /admin landing page: today's
 * orders and collections, what is in progress, outstanding balances,
 * and what needs a decision. The order queue lives at /admin/orders.
 * The layout has already applied the guard; here we only pick the
 * data mode and hand it to the client component.
 */
export default async function AdminPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Dashboard"
        subtitle="The day at a glance — orders, collections, and what needs your attention."
      />
      <AdminDashboard mode={mode} />
    </>
  );
}
