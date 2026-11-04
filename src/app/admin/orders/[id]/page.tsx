import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminOrderDetail from "@/components/admin/AdminOrderDetail";

export const metadata: Metadata = {
  title: "Admin — Order Detail",
};

/**
 * Admin order detail (Phase 4). Guard is in the /admin layout; here we
 * only pick the data mode and hand the id to the client component.
 */
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 sm:py-14">
      <AdminOrderDetail id={id} mode={mode} />
    </section>
  );
}
