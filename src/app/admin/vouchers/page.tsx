import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminVouchers from "@/components/admin/AdminVouchers";

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
    <section className="mx-auto max-w-6xl px-4 py-8 pb-24 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Gift vouchers
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        Prepaid gift cards are money: a customer pays with one at
        checkout, or the cashier redeems it against an outstanding order.
        Promo vouchers are discounts: they reduce the order total at
        checkout and are never cash. Every create, issue, redemption and
        cancellation is written to the voucher ledger and the audit log.
      </p>
      <AdminVouchers mode={mode} />
    </section>
  );
}
