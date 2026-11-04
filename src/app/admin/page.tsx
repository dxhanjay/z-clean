import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminQueue from "@/components/admin/AdminQueue";

export const metadata: Metadata = {
  title: "Admin — Order Queue",
};

/**
 * Admin order queue (Phase 4). The layout has already applied the guard
 * (demo banner, login redirect, or 403); here we only decide which data
 * mode the queue runs in and hand it to the client component.
 */
export default async function AdminPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
        Order queue
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        Every order and pickup request for Z-clean in Bokaro Steel City.
        Open an order to move it along — pickups, cleaning, delivery and
        Pay-on-Delivery collection are all managed from the order page.
      </p>
      <AdminQueue mode={mode} />
    </section>
  );
}
