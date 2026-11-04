import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminStages from "@/components/admin/AdminStages";

export const metadata: Metadata = {
  title: "Admin — Stage Queues",
};

/**
 * Stage Queues (Phase 8). Guard is in the /admin layout; here we only
 * pick the data mode and hand over to the client component. The
 * component renders its own heading; the AdminShell provides the
 * page frame (width, padding, background).
 */
export default async function AdminStagesPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";

  return <AdminStages mode={mode} />;
}
