import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminFinance from "@/components/admin/AdminFinance";

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
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Finance
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        The day&apos;s collections by method, the cash closing, who still
        owes what, refunds waiting for a decision, and the expenses
        ledger. Payments against an order are recorded on the order&apos;s
        own page; everything here is read from the same ledger.
      </p>
      <AdminFinance mode={mode} />
    </section>
  );
}
