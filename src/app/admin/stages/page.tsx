import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminStages from "@/components/admin/AdminStages";

export const metadata: Metadata = {
  title: "Admin — Stage Queues",
};

/**
 * Stage Queues (Phase 8). Guard is in the /admin layout; here we only
 * pick the data mode and hand over to the client component.
 */
export default async function AdminStagesPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <AdminStages mode={mode} />
    </section>
  );
}
