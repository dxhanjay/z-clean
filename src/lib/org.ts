/**
 * Organisation foundation (Phase 7a — Requirements v2 §3).
 *
 * The staff permission matrix as DATA: the 12 roles from the owner's
 * requirement plan, each with the workflow stage it belongs to and the
 * actions it may perform. Phase 8 (QR/OTP handovers + stage queues)
 * consumes this matrix; the database enforces the same role list in
 * `employee_roles.role` (see supabase/schema_v2.sql).
 *
 * Employees are operational records. A login is OPTIONAL and linked via
 * employees.user_id -> profiles.id — staff access always comes from the
 * employee record, never from the customer/admin `profiles.role`.
 *
 * This module is deliberately dependency-free (no React, no Supabase) so
 * the plain-node test suite (scripts/test-org.mjs) can compile it alone.
 */

/* ------------------------------------------------------------------ */
/* Staff roles — the permission matrix                                 */
/* ------------------------------------------------------------------ */

export const STAFF_ROLES = [
  {
    role: "collection_center",
    label: "Collection Center",
    stage: "Collection Center",
    actions: [
      "Receive clothes from customers and pickers",
      "Count items and verify quantities",
      "Generate order tags",
    ],
  },
  {
    role: "picker",
    label: "Picker",
    stage: "Pickup",
    actions: [
      "Pick up clothes from customers",
      "Obtain pickup confirmation (OTP or scan)",
    ],
  },
  {
    role: "transporter_inbound",
    label: "Inbound Transporter",
    stage: "Transport — Inbound",
    actions: [
      "Collect bags from collection centers",
      "Transfer bags to the laundry plant",
      "Confirm plant receipt scan",
    ],
  },
  {
    role: "plant_manager",
    label: "Plant Manager",
    stage: "Plant Management",
    actions: [
      "Verify incoming orders",
      "Assign work to plant staff",
      "Monitor quality across the plant",
    ],
  },
  {
    role: "washerman",
    label: "Washerman",
    stage: "Washing",
    actions: ["Record washing progress", "Mark washing complete"],
  },
  {
    role: "ironing_staff",
    label: "Ironing Staff",
    stage: "Ironing",
    actions: ["Complete ironing", "Update order status after ironing"],
  },
  {
    role: "quality_checker",
    label: "Quality Checker",
    stage: "Quality Check",
    actions: [
      "Check stains, damage and cleanliness",
      "Verify order accuracy before packing",
    ],
  },
  {
    role: "packer",
    label: "Packer",
    stage: "Packing",
    actions: ["Match item counts", "Pack orders", "Seal orders for dispatch"],
  },
  {
    role: "transporter_outbound",
    label: "Outbound Transporter",
    stage: "Transport — Outbound",
    actions: [
      "Collect packed bags from the plant",
      "Deliver bags to a collection center or delivery staff",
    ],
  },
  {
    role: "delivery_staff",
    label: "Home Delivery Staff",
    stage: "Home Delivery",
    actions: [
      "Hand over clothes to the customer",
      "Confirm customer receipt (OTP or scan)",
    ],
  },
  {
    role: "cashier",
    label: "Cashier / Accountant",
    stage: "Payment & Billing",
    actions: [
      "Record offline payments",
      "Reconcile transactions",
      "Manage receipts",
      "Redeem gift vouchers",
    ],
  },
  {
    role: "branch_manager",
    label: "Branch Manager",
    stage: "Branch Management",
    actions: [
      "Manage the assigned branch",
      "Manage branch staff",
      "View branch-level reports",
    ],
  },
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number]["role"];

export const STAFF_ROLE_IDS: StaffRole[] = STAFF_ROLES.map((r) => r.role);

export function staffRoleDef(role: string) {
  return STAFF_ROLES.find((r) => r.role === role) ?? null;
}

export function staffRoleLabel(role: string): string {
  return staffRoleDef(role)?.label ?? role.replace(/_/g, " ");
}

export function isStaffRole(value: string): value is StaffRole {
  return STAFF_ROLE_IDS.includes(value as StaffRole);
}

/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

export const BRANCH_TYPES = [
  { value: "plant", label: "Laundry plant" },
  { value: "collection_center", label: "Collection center" },
  { value: "branch", label: "Branch" },
] as const;

export type BranchType = (typeof BRANCH_TYPES)[number]["value"];

export function isBranchType(value: string): value is BranchType {
  return BRANCH_TYPES.some((t) => t.value === value);
}

export function branchTypeLabel(value: string): string {
  return BRANCH_TYPES.find((t) => t.value === value)?.label ?? value;
}

export const EMPLOYMENT_STATUSES = ["active", "inactive"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Employee codes — ZC-EMP-0001, ZC-EMP-0002, …                        */
/* ------------------------------------------------------------------ */

const EMPLOYEE_CODE_RE = /^ZC-EMP-(\d+)$/;

export function employeeCodeForSequence(sequence: number): string {
  const n = Math.max(1, Math.floor(sequence) || 1);
  return `ZC-EMP-${String(n).padStart(4, "0")}`;
}

/**
 * Suggest the next free employee code from the codes already in use:
 * one past the highest ZC-EMP-nnnn suffix (ZC-EMP-0001 when none exist).
 */
export function suggestNextEmployeeCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const match = EMPLOYEE_CODE_RE.exec(code.trim().toUpperCase());
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return employeeCodeForSequence(max + 1);
}

/* ------------------------------------------------------------------ */
/* Form validation (shared by the admin form, the API tests and        */
/* scripts/test-org.mjs). The API routes validate the same rules with  */
/* zod in src/lib/validation.ts.                                       */
/* ------------------------------------------------------------------ */

const INDIAN_PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PINCODE_RE = /^\d{6}$/;
const EMPLOYEE_CODE_INPUT_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface EmployeeFormInput {
  employeeCode?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  roles?: string[];
  branchId?: string | null;
  managerId?: string | null;
  joiningDate?: string;
  employmentStatus?: string;
}

export interface BranchFormInput {
  name?: string;
  type?: string;
  address?: string;
  area?: string;
  pincode?: string;
  managerEmployeeId?: string | null;
}

export type FormErrors = Record<string, string>;

function blank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim() === "";
}

export function validateEmployeeForm(input: EmployeeFormInput): {
  ok: boolean;
  errors: FormErrors;
} {
  const errors: FormErrors = {};

  if (blank(input.fullName) || input.fullName!.trim().length < 2) {
    errors.fullName = "Enter the employee's full name";
  }
  if (blank(input.phone) || !INDIAN_PHONE_RE.test(input.phone!.trim())) {
    errors.phone = "Enter a valid 10-digit Indian mobile number";
  }
  if (!blank(input.email) && !EMAIL_RE.test(input.email!.trim())) {
    errors.email = "Enter a valid email address, or leave it empty";
  }
  if (
    !blank(input.employeeCode) &&
    !EMPLOYEE_CODE_INPUT_RE.test(input.employeeCode!.trim().toUpperCase())
  ) {
    errors.employeeCode = "Use letters, numbers and dashes (e.g. ZC-EMP-0001)";
  }
  if (!input.roles || input.roles.length === 0) {
    errors.roles = "Assign at least one role";
  } else if (input.roles.some((r) => !isStaffRole(r))) {
    errors.roles = "One or more selected roles are not valid staff roles";
  }
  if (
    input.employmentStatus !== undefined &&
    input.employmentStatus !== "" &&
    !(EMPLOYMENT_STATUSES as readonly string[]).includes(input.employmentStatus)
  ) {
    errors.employmentStatus = "Employment status must be active or inactive";
  }
  if (!blank(input.joiningDate)) {
    const value = input.joiningDate!.trim();
    if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
      errors.joiningDate = "Use a valid joining date (YYYY-MM-DD)";
    }
  }
  if (input.managerId && input.branchId === undefined) {
    // manager without branch is allowed; nothing to check here.
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateBranchForm(input: BranchFormInput): {
  ok: boolean;
  errors: FormErrors;
} {
  const errors: FormErrors = {};

  if (blank(input.name) || input.name!.trim().length < 2) {
    errors.name = "Enter the branch / plant / center name";
  }
  if (blank(input.type) || !isBranchType(input.type!)) {
    errors.type = "Choose whether this is a plant, collection center or branch";
  }
  if (!blank(input.pincode) && !PINCODE_RE.test(input.pincode!.trim())) {
    errors.pincode = "Enter a valid 6-digit pincode, or leave it empty";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* DEMO MODE seed data — used ONLY when Supabase is not configured.    */
/* Clearly demo records (fictional people, 99999- demo phone range),  */
/* badged DEMO MODE by the admin layout like every other demo store.   */
/* ------------------------------------------------------------------ */

export interface Branch {
  id: string;
  name: string;
  type: BranchType;
  address: string | null;
  area: string | null;
  pincode: string | null;
  managerEmployeeId: string | null;
  active: boolean;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  userId: string | null;
  branchId: string | null;
  branchName: string | null;
  managerId: string | null;
  managerName: string | null;
  employmentStatus: EmploymentStatus;
  joiningDate: string | null;
  roles: StaffRole[];
  createdAt: string;
}

export const DEMO_BRANCHES: Branch[] = [
  {
    id: "demo-branch-plant",
    name: "Bokaro Plant — Balidih Industrial Area",
    type: "plant",
    address: "Balidih Industrial Area",
    area: "Balidih",
    pincode: "827010",
    managerEmployeeId: "demo-emp-1",
    active: true,
    createdAt: "2026-11-04T00:00:00.000Z",
  },
  {
    id: "demo-branch-sector4",
    name: "Sector 4 Collection Center",
    type: "collection_center",
    address: "City Centre, Sector 4",
    area: "Sector 4 / City Centre",
    pincode: "827004",
    managerEmployeeId: null,
    active: true,
    createdAt: "2026-11-04T00:00:00.000Z",
  },
];

export const DEMO_EMPLOYEES: Employee[] = [
  {
    id: "demo-emp-1",
    employeeCode: "ZC-EMP-0001",
    fullName: "Demo Plant Manager",
    phone: "9999999901",
    email: null,
    userId: null,
    branchId: "demo-branch-plant",
    branchName: "Bokaro Plant — Balidih Industrial Area",
    managerId: null,
    managerName: null,
    employmentStatus: "active",
    joiningDate: "2026-11-01",
    roles: ["plant_manager"],
    createdAt: "2026-11-04T00:00:00.000Z",
  },
  {
    id: "demo-emp-2",
    employeeCode: "ZC-EMP-0002",
    fullName: "Demo Picker & Delivery",
    phone: "9999999902",
    email: null,
    userId: null,
    branchId: "demo-branch-sector4",
    branchName: "Sector 4 Collection Center",
    managerId: "demo-emp-1",
    managerName: "Demo Plant Manager",
    employmentStatus: "active",
    joiningDate: "2026-11-01",
    roles: ["picker", "delivery_staff"],
    createdAt: "2026-11-04T00:00:00.000Z",
  },
  {
    id: "demo-emp-3",
    employeeCode: "ZC-EMP-0003",
    fullName: "Demo Washerman & QC",
    phone: "9999999903",
    email: null,
    userId: null,
    branchId: "demo-branch-plant",
    branchName: "Bokaro Plant — Balidih Industrial Area",
    managerId: "demo-emp-1",
    managerName: "Demo Plant Manager",
    employmentStatus: "active",
    joiningDate: "2026-11-01",
    roles: ["washerman", "quality_checker"],
    createdAt: "2026-11-04T00:00:00.000Z",
  },
];
