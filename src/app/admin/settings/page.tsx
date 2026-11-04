import type { Metadata } from "next";
import { getAdminGate } from "@/lib/admin";
import AdminSettings from "@/components/admin/AdminSettings";

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

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        Business settings
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-500">
        The contact details and thresholds the site runs on. The footer
        and contact page read the phone and WhatsApp numbers from here,
        so an edit is visible on the site as soon as it saves. Every
        edit is audit-logged.
      </p>
      <AdminSettings mode={mode} />
    </section>
  );
}
