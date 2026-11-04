/**
 * Staff roles + branch types for the app (Mobile Phase 2).
 *
 * Ported from the web app's permission matrix — src/lib/org.ts
 * (Phase 7a, Requirements v2 §3) — so the app and the web admin can
 * never drift apart on role ids or labels. The server validates the
 * same lists again (zod enums in src/lib/validation.ts), so this copy
 * is presentation-only.
 */

export interface StaffRoleDef {
  role: string;
  label: string;
  stage: string;
}

export const STAFF_ROLES: StaffRoleDef[] = [
  { role: "collection_center", label: "Collection Center", stage: "Collection Center" },
  { role: "picker", label: "Picker", stage: "Pickup" },
  { role: "transporter_inbound", label: "Inbound Transporter", stage: "Transport — Inbound" },
  { role: "plant_manager", label: "Plant Manager", stage: "Plant Management" },
  { role: "washerman", label: "Washerman", stage: "Washing" },
  { role: "ironing_staff", label: "Ironing Staff", stage: "Ironing" },
  { role: "quality_checker", label: "Quality Checker", stage: "Quality Check" },
  { role: "packer", label: "Packer", stage: "Packing" },
  { role: "transporter_outbound", label: "Outbound Transporter", stage: "Transport — Outbound" },
  { role: "delivery_staff", label: "Home Delivery Staff", stage: "Home Delivery" },
  { role: "cashier", label: "Cashier / Accountant", stage: "Payment & Billing" },
  { role: "branch_manager", label: "Branch Manager", stage: "Branch Management" },
];

export function staffRoleLabel(role: string): string {
  return STAFF_ROLES.find((r) => r.role === role)?.label ?? role.replace(/_/g, " ");
}

export const BRANCH_TYPES = [
  { value: "plant", label: "Laundry plant" },
  { value: "collection_center", label: "Collection center" },
  { value: "branch", label: "Branch" },
] as const;

export type BranchTypeValue = (typeof BRANCH_TYPES)[number]["value"];

export function branchTypeLabel(value: string): string {
  return BRANCH_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** The 8 catalogue services — mirrors web src/lib/services.ts (the
 * voucher API validates eligible-service slugs against this list). */
export const SERVICE_OPTIONS: { slug: string; name: string }[] = [
  { slug: "laundry-wash-and-fold", name: "Laundry Wash & Fold" },
  { slug: "wash-and-iron", name: "Wash & Iron" },
  { slug: "dry-cleaning", name: "Dry Cleaning" },
  { slug: "steam-iron-press", name: "Steam Iron / Press" },
  { slug: "shoe-cleaning", name: "Shoe Cleaning" },
  { slug: "leather-care", name: "Leather Care" },
  { slug: "curtain-cleaning", name: "Curtain Cleaning" },
  { slug: "carpet-cleaning", name: "Carpet Cleaning" },
];
