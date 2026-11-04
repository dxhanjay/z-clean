import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminEmployees from "@/components/admin/AdminEmployees";

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
    <section className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Employees
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        Everyone who works a stage of the laundry workflow — collection,
        pickup, transport, plant, delivery and billing. An employee can
        hold several roles when you authorise it, and every action they
        take is logged against their own record.
      </p>
      <AdminEmployees mode={mode} />
    </section>
  );
}
