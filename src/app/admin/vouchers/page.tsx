import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminVouchers from "@/components/admin/AdminVouchers";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Vouchers",
};

/**
 * Gift vouchers (Phase 7b). The layout has already applied the admin
 * guard; here we only pick the data mode.
 */
export default async function AdminVouchersPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <>
      <AdminSectionHeader
        title="Gift vouchers"
        subtitle="Prepaid gift cards are money: a customer pays with one at checkout, or the cashier redeems it against an outstanding order. Promo vouchers are discounts: they reduce the order total at checkout and are never cash. Every create, issue, redemption and cancellation is written to the voucher ledger and the audit log."
      />
      <AdminVouchers mode={mode} />
    </>
  );
}
