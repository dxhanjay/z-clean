import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Notifications",
};

/**
 * Admin notifications (Delta 1) — a derived attention list: refunds
 * waiting on decisions, orders stuck in a stage, failed payments,
 * guest pickups nobody has picked up, vouchers about to expire, and
 * unclosed cash days. Nothing is stored, so nothing here can be
 * dismissed — doing the work is what clears an item.
 */
export default async function AdminNotificationsPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Notifications"
        subtitle="What needs a human right now, derived live from refunds, orders, pickups, vouchers and the cash book."
      />
      <AdminNotifications mode={mode} />
    </>
  );
}
