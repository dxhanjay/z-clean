import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminQueue from "@/components/admin/AdminQueue";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Order Queue",
};

/**
 * Admin order queue (Phase 4; moved from /admin to /admin/orders in
 * the admin redesign so /admin could become the dashboard). The
 * layout has already applied the guard (demo banner, login redirect,
 * or 403); here we only decide which data mode the queue runs in and
 * hand it to the client component.
 */
export default async function AdminOrdersPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Order queue"
        subtitle="Every order and pickup request for Z-clean in Bokaro Steel City. Open an order to move it along — pickups, cleaning, delivery and Pay-on-Delivery collection are all managed from the order page."
      />
      <AdminQueue mode={mode} />
    </>
  );
}
