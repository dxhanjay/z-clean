/**
 * Compliance dashboard data (implementation phase, Nov 2026) — PURE.
 *
 * The single source of rows for /admin/compliance. Every row mirrors
 * a dated assessment document; nothing here is aspirational:
 *
 *   - Clauses 10.1–10.9: ~/workspace/z-clean/compliance/01 (clause
 *     report) + 02 (applicability). Statuses per that pack: 10.1,
 *     10.2, 10.3 and 10.9 are Not Applicable (the CBC media-
 *     empanelment scheme does not cover a commercial laundry
 *     platform); 10.4 and 10.5 Partially Compliant; 10.6 and 10.7
 *     Pending Verification; 10.8 Non-Compliant.
 *   - REG-* rows: the regimes that actually govern this business,
 *     from ~/workspace/z-clean/phase1-directive/08 (applicability)
 *     and 09 (registration & certification checklist). As of
 *     6 Nov 2026 Sri Clean holds NONE of those registrations.
 *
 * Rules enforced by scripts/test-compliance-data.mjs:
 *   - status is always one of COMPLIANCE_STATUSES;
 *   - a row may be "Compliant" ONLY with a non-empty evidence
 *     string (as of this writing, no row qualifies — none is);
 *   - ids are unique;
 *   - expiry is null unless a real, document-backed date exists
 *     (today: every row is null — nothing has been issued).
 *
 * The document register (~/workspace/z-clean/compliance/REGISTER.md)
 * is the evidence system of record behind these rows. Sensitive
 * originals (PAN, ITR) are never stored in the repo — the register
 * and this file hold metadata and pointers only.
 */

export const COMPLIANCE_STATUSES = [
  "Compliant",
  "Partially Compliant",
  "Non-Compliant",
  "Pending Verification",
  "Not Applicable",
] as const;

export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export type ComplianceOwner = "Owner" | "Engineering" | "CA";

export interface ComplianceRow {
  /** Stable unique id — clause number or REG-* key. */
  id: string;
  /** Requirement name / description. */
  requirement: string;
  /** Whether and how the requirement applies to Sri Clean. */
  applicability: string;
  status: ComplianceStatus;
  /** Evidence that exists today (document + date), or the verified
   *  factual basis for the status. Empty only where nothing exists
   *  and the status is not "Compliant". */
  evidence: string;
  /** What is missing before the status can improve. */
  missing: string;
  /** Responsible person. */
  owner: ComplianceOwner;
  /** ISO date (YYYY-MM-DD) of a real expiry, or null. */
  expiry: string | null;
  /** The single next action. */
  nextAction: string;
}

export const COMPLIANCE_ROWS: ComplianceRow[] = [
  // ---- Clauses 10.1–10.9 (media-empanelment scheme, as supplied) ----
  {
    id: "10.1",
    requirement:
      "One year of continuous operation under the same name & address (scheme clause 10.1)",
    applicability:
      "Not Applicable — the scheme covers news/media properties; Sri Clean is a transactional laundry service (compliance file 02).",
    status: "Not Applicable",
    evidence:
      "Website publicly launched 4 Nov 2026 — GitHub repo + Vercel deployment records (compliance file 01). Operation history is days, and none will be backdated.",
    missing:
      "Nothing — the category does not cover this business. (On facts alone the platform would also fail the one-year test.)",
    owner: "Owner",
    expiry: null,
    nextAction: "None. Do not file under this scheme.",
  },
  {
    id: "10.2",
    requirement:
      "Minimum daily/monthly unique-user threshold (scheme clause 10.2)",
    applicability:
      "Not Applicable — an empanelment audience metric for media properties, not a requirement on a service platform.",
    status: "Not Applicable",
    evidence:
      "Verified 6 Nov 2026: no GA4/GTM/any tracker exists in the codebase, so no verifiable user counts exist and none are claimed (compliance file 01).",
    missing:
      "Internal measurement capability: GA4 (or equivalent) analytics — see the 10.3 row's next action. Artificial traffic is prohibited and will not be generated.",
    owner: "Engineering",
    expiry: null,
    nextAction:
      "No scheme action. For the business itself, implement GA4 per compliance file 06 (roadmap P1-1).",
  },
  {
    id: "10.3",
    requirement:
      "Verified unique-user base from a reputable analytics provider, auditor-certifiable (scheme clause 10.3)",
    applicability:
      "Not Applicable — same media-empanelment metric family as 10.2.",
    status: "Not Applicable",
    evidence:
      "No analytics provider is configured; the register's analytics category is empty (REGISTER.md category 8).",
    missing:
      "GA4 property + consent-mode integration + monthly verifiable exports filed in the register.",
    owner: "Engineering",
    expiry: null,
    nextAction:
      "Install GA4 with cookie consent and a privacy-policy update in one release (roadmap P1-1); file the first monthly export in REGISTER.md category 8.",
  },
  {
    id: "10.4",
    requirement: "Indian ownership, servers and operations (clause 10.4)",
    applicability:
      "Partially applicable — as a general readiness expectation, not via the scheme.",
    status: "Partially Compliant",
    evidence:
      "Indian owner-operator; operations in Bokaro, Jharkhand. Hosting: Vercel (US provider, global edge); database: Supabase (compliance file 04).",
    missing:
      "Database region VERIFIED 6 Nov 2026: Supabase project is in South Asia (Mumbai), ap-south-1 — stored data is India-resident. Remaining gaps: no business-owned domain (site runs on a vercel.app subdomain) and the web layer is served by Vercel (US provider, global edge).",
    owner: "Owner",
    expiry: null,
    nextAction:
      "File the Mumbai-region dashboard evidence in REGISTER.md category 4; buy the business domain (roadmap P2-3); decide on the web-layer hosting at Step 4.",
  },
  {
    id: "10.5",
    requirement: "Cybersecurity compliance (clause 10.5)",
    applicability:
      "Applicable — good practice and an IT Act / DPDP expectation for any platform handling personal data.",
    status: "Partially Compliant",
    evidence:
      "Internal security audit completed 4 Nov 2026 (AUDIT_FINDINGS.md: 0 Critical, 9 High, 19 Medium, 14 Low) with P0 fixes executed and verified the same day; HTTPS enforced with a valid auto-renewed certificate and a strong CSP observed live 6 Nov 2026 (compliance file 05).",
    missing:
      "No independent/CERT-In-empanelled audit or VAPT has been performed (an SSL certificate is not a substitute). Dependency-vulnerability scan still unverified (npm audit blocked in the build env); mandatory MFA enrolment for all admin accounts; backup restore never test-verified.",
    owner: "Engineering",
    expiry: null,
    nextAction:
      "Run npm audit from an unrestricted network and enable Dependabot (roadmap P0-3); enforce admin MFA enrolment (roadmap P1-5).",
  },
  {
    id: "10.6",
    requirement:
      "Previous financial year's Income Tax Return + website/app revenue records (clause 10.6)",
    applicability:
      "Applicable — as business documentation discipline.",
    status: "Pending Verification",
    evidence:
      "The admin Finance ledger is the system of record for order revenue from 4 Nov 2026 onward (compliance file 08).",
    missing:
      "No ITR, ITR-V acknowledgement or financial statements are on file. The business began operating Nov 2026 (FY 2026-27); which FY's ITR applies is the CA's call.",
    owner: "CA",
    expiry: null,
    nextAction:
      "Owner + CA: confirm the applicable ITR and record a pointer entry in REGISTER.md category 3 (originals stay in the owner's secure store).",
  },
  {
    id: "10.7",
    requirement: "Business registration + PAN (clause 10.7)",
    applicability: "Applicable.",
    status: "Pending Verification",
    evidence:
      "Checklist prepared (compliance file 07); verified 6 Nov 2026 that the documentation folder holds no registration certificate or PAN documentation.",
    missing:
      "Entity decision, registration certificate (Udyam/incorporation) and a PAN pointer entry. PAN originals are never stored in this repo or published.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "Decide the entity form with the CA, then complete registration (roadmap P2-1; Phase 1 file 09 items A1–A2).",
  },
  {
    id: "10.8",
    requirement:
      "Operator & office address, official email, contact number — consistent everywhere (clause 10.8)",
    applicability: "Applicable.",
    status: "Non-Compliant",
    evidence:
      "The public site currently displays a DEMO phone number (+91 24456 7889), no business email and no published address (compliance file 01).",
    missing:
      "Real business phone, official email and registered/operational address — only the owner can supply these.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "Owner supplies the real details; engineering replaces the demo values in one release (roadmap P0-1).",
  },
  {
    id: "10.9",
    requirement:
      "Government approval via the authorised committee process (clause 10.9)",
    applicability:
      "Not Applicable — the scheme does not cover this business category (compliance file 02).",
    status: "Not Applicable",
    evidence:
      "Applicability assessment, compliance file 02: the framework empanels media/content properties to carry government advertising.",
    missing:
      "Nothing. No application is prepared or filed, and no government approval is claimed or implied anywhere on the platform.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "None under this scheme. Any future genuinely-applicable scheme follows the standing checklist in compliance file 09.",
  },

  // ---- Regimes that actually govern Sri Clean (Phase 1 files 08/09) ----
  {
    id: "REG-DPDP",
    requirement: "DPDP Act 2023 readiness (privacy, consent, data-principal rights)",
    applicability:
      "Applicable — mandatory (phased commencement; main tranche incl. breach notification lands ~13 May 2027 per counsel analysis in Phase 1 file 08 §11).",
    status: "Partially Compliant",
    evidence:
      "Privacy policy and terms are live on the site; the platform collects location only under assignment-based staff flows with RLS access control (internal audit, 4 Nov 2026).",
    missing:
      "Formal DPDP gap review (consent wording, access/correction/erasure rights, grievance contact, children's-data check) and a self-serve account & data deletion flow.",
    owner: "Engineering",
    expiry: null,
    nextAction:
      "Run the gap review of /privacy and ship the deletion flow (roadmap P1-2, P1-3); legal wording reviewed by owner/CA before publish.",
  },
  {
    id: "REG-ECOM",
    requirement:
      "Consumer Protection (E-Commerce) Rules 2020 — seller identity, grievance officer, price & refund transparency",
    applicability:
      "Applicable — mandatory for selling services through Sri Clean's own website/app.",
    status: "Non-Compliant",
    evidence:
      "Itemised bills with server-computed totals are generated per order (compliance file 08).",
    missing:
      "Legal entity name, registered address, and Grievance Officer name + contact are not published; the site still shows a demo phone and no email (see 10.8).",
    owner: "Owner",
    expiry: null,
    nextAction:
      "Publish the identity + grievance block once the owner supplies real details (roadmap P1-4; depends on P0-1).",
  },
  {
    id: "REG-SE",
    requirement: "Shops & Establishments registration (Jharkhand)",
    applicability:
      "Applicable — mandatory for an establishment with employees in Jharkhand (Phase 1 file 08 §5).",
    status: "Non-Compliant",
    evidence:
      "Filing route and fee verified 6 Nov 2026: Shramadhan portal (shramadhan.jharkhand.gov.in), ₹240 slab for ≤10 employees, 10-year validity (Phase 1 file 09 item A4).",
    missing: "Registration — not filed. Sri Clean holds no S&E registration today.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "File on the Shramadhan portal once the entity decision (10.7) and premises address (REGISTER.md category 9) exist.",
  },
  {
    id: "REG-TRADE",
    requirement: "Municipal trade licence (Bokaro)",
    applicability:
      "Applicable — mandatory for trading from premises under the Jharkhand Municipal Act 2011 (Phase 1 file 08 §6).",
    status: "Non-Compliant",
    evidence:
      "Fee schedule verified 6 Nov 2026 (by built-up area, ₹300–₹2,500/yr); the exact Bokaro figure is unverified, and the issuer depends on the premises (Chas Municipal Corporation vs BSL township desk).",
    missing:
      "Trade licence — not filed. Premises address + tenure papers are not yet recorded.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "Record the premises facts, confirm the issuing desk locally, then file (indicative ₹500–₹2,500/yr).",
  },
  {
    id: "REG-PTAX",
    requirement: "Professional tax — employer enrolment (Jharkhand)",
    applicability:
      "Applicable — mandatory for an employer under the Jharkhand Professions Tax Act 2011 (Phase 1 file 08 §7).",
    status: "Non-Compliant",
    evidence:
      "Schedule verified 6 Nov 2026: employer pays ₹500/yr (≤5 employees) or ₹1,000/yr (6–10); most staff salaries fall in the Nil employee-deduction slab (≤₹3 lakh).",
    missing: "Employer enrolment — not filed; payroll PT setup not done.",
    owner: "CA",
    expiry: null,
    nextAction:
      "Enrol via jharkhandcommercialtax.gov.in alongside the S&E filing; CA sets up payroll deduction.",
  },
  {
    id: "REG-GST",
    requirement: "GST registration",
    applicability:
      "Conditional — mandatory only when aggregate turnover exceeds ₹20 lakh for services in a financial year (Phase 1 file 08 §4). Not triggered today.",
    status: "Pending Verification",
    evidence:
      "Revenue is tracked in the admin Finance ledger from 4 Nov 2026; turnover to date is far below the threshold (mostly test orders).",
    missing:
      "GSTIN — not applicable yet. CA trigger monitoring (turnover counted across all businesses on the same PAN) is not set up.",
    owner: "CA",
    expiry: null,
    nextAction:
      "CA monitors turnover against the ₹20 lakh threshold and registers on gst.gov.in when triggered (Phase 1 file 09 item A7).",
  },
  {
    id: "REG-JSPCB",
    requirement: "Pollution consent — JSPCB Consent to Establish / Operate",
    applicability:
      "Conditional — a standalone mechanised laundry using a boiler is in the CPCB Orange category (Jan 2025 list, entry 132); applicability turns on premises/boiler facts not yet recorded (Phase 1 file 08 §10).",
    status: "Pending Verification",
    evidence:
      "Category identified in Phase 1 file 08 §10; no assessment has been made with JSPCB.",
    missing:
      "Premises sheet (boiler yes/no + capacity, effluent volume/discharge, in-house vs outsourced solvent dry-cleaning); written JSPCB category confirmation; boiler registration if ≥25 L; hazardous-waste authorisation if solvent work is in-house.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "Record the premises facts and obtain JSPCB regional-office confirmation via an environmental consultant (Phase 1 file 09 items A9–A11).",
  },
  {
    id: "REG-CERTIN",
    requirement:
      "CERT-In Directions 2022 — incident reporting, log retention, point of contact",
    applicability:
      "Applicable — mandatory operational duties with no size exemption (Phase 1 file 08 §14). Not a certification.",
    status: "Partially Compliant",
    evidence:
      "Access and admin-action audit logs exist (Requirements v2 audit module; Vercel/Supabase platform logs) — compliance file 05 item 15.",
    missing:
      "No written incident-response runbook; no point of contact nominated to CERT-In; ICT log retention on platform entry tiers is shorter than the required 180 days within India.",
    owner: "Engineering",
    expiry: null,
    nextAction:
      "Write the one-page incident-response plan and nominate the PoC (roadmap P1-7); close the 180-day log-retention gap or document the residual risk.",
  },
  {
    id: "REG-VAPT",
    requirement: "Independent security audit / VAPT by a CERT-In empanelled auditor",
    applicability:
      "Recommended assurance — not legally mandatory today; required before any authority or enterprise customer can be shown an independent report (Phase 1 file 09 item B1).",
    status: "Non-Compliant",
    evidence:
      "Only an internal audit exists (4 Nov 2026, REGISTER.md category 7). No external assessment has been commissioned.",
    missing: "VAPT report + remediation closure letter from a CERT-In empanelled agency.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "Commission after the own-domain migration and P0/P1 security fixes, so the tested surface is the real production one (roadmap P3; indicative budget ₹35,000–₹75,000 + GST).",
  },
  {
    id: "REG-DOMAIN",
    requirement: "Business-owned domain (identity + clause 10.4 readiness)",
    applicability:
      "Applicable — the business should operate on its own domain; today it uses a provider subdomain.",
    status: "Non-Compliant",
    evidence:
      "Site operates on z-clean-iota.vercel.app (a Vercel subdomain). zclean.com and getzclean.com verified taken on 6 Nov 2026 (Phase 1 file 10).",
    missing:
      "Domain registration in the business's name (recommended zclean.in + zclean.co.in) and the registration evidence for REGISTER.md category 5.",
    owner: "Owner",
    expiry: null,
    nextAction:
      "Owner approves the quotation (indicative ₹940–₹1,580 first year incl. GST) and buys the domain; engineering then migrates DNS/SSL/auth callbacks.",
  },
];

/** Summary counts by status, in the canonical status order. */
export function complianceStatusCounts(
  rows: ComplianceRow[] = COMPLIANCE_ROWS,
): { status: ComplianceStatus; count: number }[] {
  return COMPLIANCE_STATUSES.map((status) => ({
    status,
    count: rows.filter((row) => row.status === status).length,
  }));
}
