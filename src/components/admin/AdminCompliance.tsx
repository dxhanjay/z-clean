import {
  COMPLIANCE_ROWS,
  complianceStatusCounts,
  type ComplianceStatus,
} from "@/lib/compliance-data";

/**
 * Compliance dashboard (implementation phase, Nov 2026) — READ-ONLY.
 *
 * Server-rendered from src/lib/compliance-data.ts, which mirrors the
 * dated assessments in ~/workspace/z-clean/compliance/ (files 01/02)
 * and the Phase 1 directive pack (files 08/09), with the document
 * register (compliance/REGISTER.md) as the evidence system of
 * record. There is deliberately no editing UI and no database write:
 * a status changes by changing the assessed facts — a document
 * filed, a registration issued, an audit completed — and then
 * updating the data file with a dated source, never by clicking a
 * pill. A row is never shown "Compliant" without an evidence entry.
 */

const PILL_CLS: Record<ComplianceStatus, string> = {
  Compliant: "bg-emerald-100 text-emerald-800",
  "Partially Compliant": "bg-sky-100 text-sky-800",
  "Non-Compliant": "bg-red-100 text-red-800",
  "Pending Verification": "bg-amber-100 text-amber-800",
  "Not Applicable": "bg-slate-200 text-slate-600",
};

const SUMMARY_TILE_CLS: Record<ComplianceStatus, string> = {
  Compliant: "border-emerald-200 bg-emerald-50 text-emerald-900",
  "Partially Compliant": "border-sky-200 bg-sky-50 text-sky-900",
  "Non-Compliant": "border-red-200 bg-red-50 text-red-900",
  "Pending Verification": "border-amber-200 bg-amber-50 text-amber-900",
  "Not Applicable": "border-slate-200 bg-slate-50 text-slate-700",
};

export default function AdminCompliance() {
  const counts = complianceStatusCounts();
  const rows = COMPLIANCE_ROWS;

  return (
    <>
      {/* Summary counts by status */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {counts.map(({ status, count }) => (
          <div
            key={status}
            className={`rounded-xl border p-4 ${SUMMARY_TILE_CLS[status]}`}
          >
            <p className="text-3xl font-extrabold leading-none">{count}</p>
            <p className="mt-1.5 text-xs font-bold uppercase tracking-wide opacity-80">
              {status}
            </p>
          </div>
        ))}
      </div>

      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-admin-muted">
        {rows.length} requirements tracked: clauses 10.1–10.9 of the
        scheme the owner supplied (assessed in the compliance pack —
        that scheme is a media-empanelment framework and largely does
        not apply to this business), plus the regimes that actually
        govern Sri Clean. Statuses come from dated assessments, not from
        this screen.
      </p>

      {/* Requirements table */}
      <div className="overflow-x-auto rounded-xl border border-admin-border bg-white">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-admin-border bg-admin-panel text-xs uppercase tracking-wide text-admin-muted">
              <th scope="col" className="px-4 py-3 font-bold">Ref</th>
              <th scope="col" className="px-4 py-3 font-bold">Requirement</th>
              <th scope="col" className="px-4 py-3 font-bold">Applicability</th>
              <th scope="col" className="px-4 py-3 font-bold">Status</th>
              <th scope="col" className="px-4 py-3 font-bold">Evidence available</th>
              <th scope="col" className="px-4 py-3 font-bold">Missing</th>
              <th scope="col" className="px-4 py-3 font-bold">Owner</th>
              <th scope="col" className="px-4 py-3 font-bold">Expiry</th>
              <th scope="col" className="px-4 py-3 font-bold">Next action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-admin-border align-top last:border-b-0"
              >
                <td className="whitespace-nowrap px-4 py-3 font-bold text-admin-heading">
                  {row.id}
                </td>
                <td className="min-w-[200px] px-4 py-3 font-semibold text-ink-900">
                  {row.requirement}
                </td>
                <td className="min-w-[190px] px-4 py-3 leading-relaxed text-ink-700">
                  {row.applicability}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${PILL_CLS[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="min-w-[220px] px-4 py-3 leading-relaxed text-ink-700">
                  {row.evidence || "—"}
                </td>
                <td className="min-w-[220px] px-4 py-3 leading-relaxed text-ink-700">
                  {row.missing}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                  {row.owner}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                  {row.expiry ?? "—"}
                </td>
                <td className="min-w-[220px] px-4 py-3 leading-relaxed text-ink-700">
                  {row.nextAction}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="mt-6 rounded-xl border border-admin-border bg-white p-5 text-sm leading-relaxed text-admin-muted">
        <p className="font-bold text-admin-heading">Read-only — v1</p>
        <p className="mt-1.5">
          This dashboard does not edit anything: there is no editing UI
          and no database write behind it. Rows are rendered from{" "}
          <code className="rounded bg-admin-panel px-1 py-0.5 text-[13px]">
            src/lib/compliance-data.ts
          </code>
          , which mirrors the compliance pack (files 01/02/10) and the
          Phase 1 directive pack (files 08/09). The evidence system of
          record is the document register (
          <code className="rounded bg-admin-panel px-1 py-0.5 text-[13px]">
            compliance/REGISTER.md
          </code>
          ) — sensitive originals such as PAN and ITR documents are
          never stored in the repository; the register holds metadata
          and storage pointers only. A status improves only when the
          underlying fact changes and the data file is updated with its
          dated source.
        </p>
      </footer>
    </>
  );
}
