import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminReports from "@/components/admin/AdminReports";

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
    <section className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Reports
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        Sales, collections, plant throughput, pending-order aging,
        employee performance from the handover ledger, voucher usage,
        customer retention and expenses — every number computed from the
        live records, nothing estimated.
      </p>
      <AdminReports mode={mode} />
    </section>
  );
}
