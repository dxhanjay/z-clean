import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminPricing from "@/components/admin/AdminPricing";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Pricing",
};

/**
 * Pricing editor (Phase 7b). The layout has already applied the admin
 * guard; here we only pick the data mode.
 */
export default async function AdminPricingPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Pricing"
        subtitle="The live price list. Change a price, an express multiplier, or switch an item off — the pricing page, the order form and checkout all read from these same rows, so the change is live everywhere the moment it saves. Every edit is audit-logged."
      />
      <AdminPricing mode={mode} />
    </>
  );
}
