import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import { hasRole } from "@/lib/roles";
import AdminReviews from "@/components/admin/AdminReviews";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Reviews",
};

/**
 * Review moderation (Delta 3). Customers review delivered orders;
 * nothing reaches the public site until a review is approved here.
 * Viewing the queue is open to every admin tier; approving,
 * un-approving and deleting are admin-tier actions (enforced again
 * by the API — the page only decides which buttons to render).
 */
export default async function AdminReviewsPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";
  const canModerate = gate.kind === "ok" && hasRole(gate.role, "admin");

  return (
    <>
      <AdminSectionHeader
        title="Reviews"
        subtitle="Real customer reviews of delivered orders. Only approved reviews appear on the website — approving is the publish button."
      />
      <AdminReviews mode={mode} canModerate={canModerate} />
    </>
  );
}
