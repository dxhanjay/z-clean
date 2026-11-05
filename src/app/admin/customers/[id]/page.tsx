import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import { hasRole } from "@/lib/roles";
import AdminCustomerDetail from "@/components/admin/AdminCustomerDetail";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Customer detail",
};

/**
 * Customer detail (Delta 1). The disable/enable switch is shown only
 * to admin-tier callers (canManage) and the API enforces the same
 * minimum — the prop is presentation, never the guard.
 */
export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";
  const canManage =
    gate.kind === "demo" ? false : gate.kind === "ok" && hasRole(gate.role, "admin");
  const { id } = await params;

  return (
    <>
      <AdminSectionHeader
        title="Customer detail"
        subtitle="Profile, addresses, recent orders and account controls for one customer."
      />
      <AdminCustomerDetail
        mode={mode}
        customerId={decodeURIComponent(id)}
        canManage={canManage}
      />
    </>
  );
}
