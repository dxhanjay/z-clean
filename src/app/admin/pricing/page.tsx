import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminPricing from "@/components/admin/AdminPricing";

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
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Pricing
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        The live price list. Change a price, an express multiplier, or
        switch an item off — the pricing page, the order form and
        checkout all read from these same rows, so the change is live
        everywhere the moment it saves. Every edit is audit-logged.
      </p>
      <AdminPricing mode={mode} />
    </section>
  );
}
