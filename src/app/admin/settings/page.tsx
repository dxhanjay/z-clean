import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminMfa from "@/components/admin/AdminMfa";
import AdminTeamRoles from "@/components/admin/AdminTeamRoles";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Admin — Settings",
};

/**
 * Business settings editor (Phase 7b). The layout has already applied
 * the admin guard; here we only pick the data mode.
 */
export default async function AdminSettingsPage() {
  const gate = await getAdminGate();
  const mode = gate.kind === "demo" ? "demo" : "live";
  // Delta 1: the Team & Roles card is admin-tier and up (the API
  // enforces the same); in demo it renders its explainer state.
  const showTeam =
    gate.kind === "demo" || (gate.kind === "ok" && hasRole(gate.role, "admin"));

  return (
    <>
      <AdminSectionHeader
        title="Business settings"
        subtitle="The contact details and thresholds the site runs on. The footer and contact page read the phone and WhatsApp numbers from here, so an edit is visible on the site as soon as it saves. Every edit is audit-logged."
      />
      <AdminSettings mode={mode} />
      <AdminMfa mode={mode} />
      {showTeam && (
        <AdminTeamRoles
          mode={mode}
          currentUserId={gate.kind === "ok" ? gate.user.id : null}
          currentRole={gate.kind === "ok" ? gate.role : null}
        />
      )}
    </>
  );
}
