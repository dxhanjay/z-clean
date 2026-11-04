import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminEmployees from "@/components/admin/AdminEmployees";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Employees",
};

/**
 * Employee management (Phase 7a). The layout has already applied the
 * admin guard; here we only pick the data mode.
 */
export default async function AdminEmployeesPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Employees"
        subtitle="Everyone who works a stage of the laundry workflow — collection, pickup, transport, plant, delivery and billing. An employee can hold several roles when you authorise it, and every action they take is logged against their own record."
      />
      <AdminEmployees mode={mode} />
    </>
  );
}
