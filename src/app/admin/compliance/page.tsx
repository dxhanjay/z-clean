import type { Metadata } from "next";
import AdminCompliance from "@/components/admin/AdminCompliance";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";

export const metadata: Metadata = {
  title: "Admin — Compliance",
};

/**
 * Compliance dashboard (implementation phase, Nov 2026) — an internal,
 * read-only readiness board. The admin gate is the shared layout's
 * (getAdminGate in src/app/admin/layout.tsx), exactly like every
 * sibling section; this page adds no gate of its own and performs no
 * writes. Rows come from src/lib/compliance-data.ts; the evidence
 * behind them lives in the compliance document register.
 */
export default function AdminCompliancePage() {
  return (
    <>
      <AdminSectionHeader
        title="Compliance"
        subtitle="Readiness against the supplied scheme clauses and the Indian regimes that actually govern Sri Clean — statuses from dated assessments and the document register, never self-declared."
      />
      <AdminCompliance />
    </>
  );
}
