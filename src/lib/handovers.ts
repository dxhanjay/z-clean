/**
 * QR/OTP handovers (Phase 8 — Requirements v2 §2/§3).
 *
 * The handover chain is DATA: one ordered list of transfer points that
 * an order walks from the customer's doorstep back to the customer's
 * doorstep. Every stage transfer is verified — pickup and delivery by
 * the customer's OTP, everything else by scanning the order's QR code —
 * and recorded against real employees from the Phase 7a permission
 * matrix (src/lib/org.ts). The queue UI, the stage queues and the API
 * validation all read this one list, so they can never disagree.
 *
 * Handovers ATTACH to the canonical lifecycle in src/lib/order-flow.ts
 * (Requirements v2 §4: no parallel status system). A point may carry a
 * `statusEffect` — the lifecycle status the order moves to when the
 * handover completes — and completion is only ever allowed when that
 * move is legal per order-flow's `canTransition`. Plant-internal stages
 * are handover points inside IN_PROCESS (the 6 care stages from
 * src/lib/services.ts `careStages`).
 *
 * Staff have no separate login yet (Phase 7a decision): handovers are
 * recorded from the admin console, where the operator SELECTS the
 * employee who is physically receiving the items. The selected employee
 * is validated here (active + holds the point's receiving role); the
 * admin account performing the action is audit-logged separately.
 *
 * This module is deliberately dependency-free (no React, no Supabase)
 * so the plain-node test suite (scripts/test-handovers.mjs) can
 * compile it alone.
 */

import { canTransition, isTerminal } from "./order-flow";
import { isStaffRole, staffRoleLabel, type StaffRole } from "./org";

/* ------------------------------------------------------------------ */
/* Flags — the anomaly vocabulary from the requirement plan. A flag    */
/* records a problem; it never blocks the handover (operations keep    */
/* moving, management investigates).                                   */
/* ------------------------------------------------------------------ */

export const HANDOVER_FLAGS = [
  "missing_item",
  "quantity_mismatch",
  "duplicate",
  "wrong_order",
  "unauthorized",
  "otp_retry",
] as const;

export type HandoverFlag = (typeof HANDOVER_FLAGS)[number];

export function isHandoverFlag(value: string): value is HandoverFlag {
  return (HANDOVER_FLAGS as readonly string[]).includes(value);
}

export function handoverFlagLabel(flag: string): string {
  switch (flag) {
    case "missing_item":
      return "Missing item reported";
    case "quantity_mismatch":
      return "Quantity mismatch";
    case "duplicate":
      return "Duplicate scan";
    case "wrong_order":
      return "Wrong order";
    case "unauthorized":
      return "Unauthorised transfer";
    case "otp_retry":
      return "OTP retries";
    default:
      return flag.replace(/_/g, " ");
  }
}

/* ------------------------------------------------------------------ */
/* The chain                                                           */
/* ------------------------------------------------------------------ */

export type HandoverMethod = "qr" | "otp";
export type OtpKind = "pickup" | "delivery";

export interface HandoverPoint {
  id: string;
  /** Full label for staff screens. */
  label: string;
  /** Customer-facing milestone label (no employee names, ever). */
  customerLabel: string;
  /** The care-stage title for plant-internal points, else null. */
  stage: string | null;
  /**
   * Who hands over. Informational (the receiver is what gets
   * validated): "customer" for the two doorstep points, otherwise the
   * role that physically passes the items on.
   */
  fromRole: StaffRole | "customer";
  fromLabel: string;
  /** The role the RECEIVING employee must hold. */
  toRole: StaffRole;
  /** Additional roles that may also receive at this point. */
  alsoToRoles: StaffRole[];
  toLabel: string;
  method: HandoverMethod;
  /** Which of the order's OTPs this point verifies (OTP points only). */
  otpKind: OtpKind | null;
  /** Lifecycle status the order moves to on completion, or null. */
  statusEffect: string | null;
}

const CUSTOMER = "Customer";

export const HANDOVER_CHAIN: HandoverPoint[] = [
  {
    id: "pickup",
    label: "Pickup from customer",
    customerLabel: "Picked up from your doorstep",
    stage: null,
    fromRole: "customer",
    fromLabel: CUSTOMER,
    toRole: "picker",
    alsoToRoles: [],
    toLabel: "Picker",
    method: "otp",
    otpKind: "pickup",
    statusEffect: "PICKED_UP",
  },
  {
    id: "picker_to_centre",
    label: "Picker hands over to Collection Center",
    customerLabel: "Received at the collection center",
    stage: null,
    fromRole: "picker",
    fromLabel: "Picker",
    toRole: "collection_center",
    alsoToRoles: [],
    toLabel: "Collection Center",
    method: "qr",
    otpKind: null,
    statusEffect: null,
  },
  {
    id: "centre_to_plant",
    label: "Collection Center / Inbound Transport to Plant",
    customerLabel: "Received at our laundry plant",
    stage: null,
    fromRole: "collection_center",
    fromLabel: "Collection Center / Inbound Transporter",
    toRole: "plant_manager",
    alsoToRoles: [],
    toLabel: "Plant Manager",
    method: "qr",
    otpKind: null,
    statusEffect: "RECEIVED",
  },
  {
    id: "plant_sorting",
    label: "Sorting & Inspection → Stain Treatment",
    customerLabel: "Sorted and inspected at the plant",
    stage: "Sorting & Inspection",
    fromRole: "plant_manager",
    fromLabel: "Plant Manager",
    toRole: "washerman",
    alsoToRoles: [],
    toLabel: "Washerman",
    method: "qr",
    otpKind: null,
    statusEffect: "IN_PROCESS",
  },
  {
    id: "plant_stain",
    label: "Stain Treatment → Processing",
    customerLabel: "Stain treatment done",
    stage: "Stain Treatment",
    fromRole: "washerman",
    fromLabel: "Washerman",
    toRole: "washerman",
    alsoToRoles: [],
    toLabel: "Washerman",
    method: "qr",
    otpKind: null,
    statusEffect: null,
  },
  {
    id: "plant_processing",
    label: "Processing → Finishing",
    customerLabel: "Washing / dry cleaning done",
    stage: "Processing",
    fromRole: "washerman",
    fromLabel: "Washerman",
    toRole: "ironing_staff",
    alsoToRoles: [],
    toLabel: "Ironing Staff",
    method: "qr",
    otpKind: null,
    statusEffect: null,
  },
  {
    id: "plant_finishing",
    label: "Finishing → Quality Check",
    customerLabel: "Finishing done — pressing and folding",
    stage: "Finishing",
    fromRole: "ironing_staff",
    fromLabel: "Ironing Staff",
    toRole: "quality_checker",
    alsoToRoles: [],
    toLabel: "Quality Checker",
    method: "qr",
    otpKind: null,
    statusEffect: null,
  },
  {
    id: "plant_qc",
    label: "Quality Check → Packing",
    customerLabel: "Quality check passed",
    stage: "Quality Check",
    fromRole: "quality_checker",
    fromLabel: "Quality Checker",
    toRole: "packer",
    alsoToRoles: [],
    toLabel: "Packer",
    method: "qr",
    otpKind: null,
    statusEffect: null,
  },
  {
    id: "plant_packing",
    label: "Packing complete — ready for dispatch",
    customerLabel: "Packed and ready for dispatch",
    stage: "Packing",
    fromRole: "packer",
    fromLabel: "Packer",
    toRole: "packer",
    alsoToRoles: [],
    toLabel: "Packer",
    method: "qr",
    otpKind: null,
    statusEffect: "READY",
  },
  {
    id: "packer_to_outbound",
    label: "Packer hands over to Outbound Transport",
    customerLabel: "Handed to our delivery rider",
    stage: null,
    fromRole: "packer",
    fromLabel: "Packer",
    toRole: "transporter_outbound",
    alsoToRoles: [],
    toLabel: "Outbound Transporter",
    method: "qr",
    otpKind: null,
    statusEffect: "OUT_FOR_DELIVERY",
  },
  {
    id: "delivery",
    label: "Delivery to customer",
    customerLabel: "Delivered back to you",
    stage: null,
    fromRole: "transporter_outbound",
    fromLabel: "Outbound Transporter / Home Delivery Staff",
    toRole: "delivery_staff",
    alsoToRoles: ["transporter_outbound"],
    toLabel: CUSTOMER,
    method: "otp",
    otpKind: "delivery",
    statusEffect: "DELIVERED",
  },
];

export function handoverPoint(id: string): HandoverPoint | null {
  return HANDOVER_CHAIN.find((p) => p.id === id) ?? null;
}

/** Roles allowed to RECEIVE at a point (primary + alternates). */
export function receivingRoles(point: HandoverPoint): StaffRole[] {
  return [point.toRole, ...point.alsoToRoles];
}

/* ------------------------------------------------------------------ */
/* Progress derivation — no current_point column anywhere. An order    */
/* awaits the first chain point it has not completed, gated by its     */
/* lifecycle status: terminal orders and payment side-states are not   */
/* in the handover flow at all.                                        */
/* ------------------------------------------------------------------ */

const NOT_IN_FLOW_STATUSES = new Set([
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "REFUNDED",
]);

export function completedPointIds(
  handovers: readonly { pointId: string }[],
): Set<string> {
  return new Set(handovers.map((h) => h.pointId));
}

export function nextHandoverPoint(
  orderStatus: string,
  completed: ReadonlySet<string>,
): HandoverPoint | null {
  if (isTerminal(orderStatus)) return null;
  if (NOT_IN_FLOW_STATUSES.has(orderStatus)) return null;
  return HANDOVER_CHAIN.find((p) => !completed.has(p.id)) ?? null;
}

export interface ChainProgress {
  completedCount: number;
  totalCount: number;
  next: HandoverPoint | null;
  /** True when every point is done (the chain ran end to end). */
  chainComplete: boolean;
}

export function chainProgress(
  orderStatus: string,
  completed: ReadonlySet<string>,
): ChainProgress {
  const completedCount = HANDOVER_CHAIN.filter((p) => completed.has(p.id)).length;
  return {
    completedCount,
    totalCount: HANDOVER_CHAIN.length,
    next: nextHandoverPoint(orderStatus, completed),
    chainComplete: completedCount === HANDOVER_CHAIN.length,
  };
}

/* ------------------------------------------------------------------ */
/* Quantities. order_items.qty is the ordered amount (pieces for       */
/* per-piece services; kg / sq ft for weight/area services, possibly   */
/* fractional). The handover quantity is the physical count staff      */
/* confirm as they pass the items on; the expected value is the        */
/* order's total quantity rounded to a whole count. A difference is a  */
/* flag, never a block.                                                */
/* ------------------------------------------------------------------ */

export function orderItemCount(items: readonly { qty: number }[]): number {
  return Math.round(
    items.reduce((sum, i) => sum + (Number.isFinite(i.qty) ? i.qty : 0), 0),
  );
}

export function quantityFlags(quantity: number, expectedQuantity: number): HandoverFlag[] {
  return quantity !== expectedQuantity ? ["quantity_mismatch"] : [];
}

/* ------------------------------------------------------------------ */
/* OTPs — 6-digit numeric codes, one per order per doorstep point.     */
/* Five failed attempts (shared counter across both OTPs, mirroring   */
/* the single orders.otp_attempts column) lock OTP verification until  */
/* an admin regenerates the code.                                      */
/* ------------------------------------------------------------------ */

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RE = /^\d{6}$/;

function defaultNextInt(maxExclusive: number): number {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/** Generate a 6-digit OTP (leading zeros kept). RNG is injectable for tests. */
export function generateOtp(
  nextInt: (maxExclusive: number) => number = defaultNextInt,
): string {
  return String(nextInt(1_000_000)).padStart(6, "0");
}

export function isOtpFormat(value: string): boolean {
  return OTP_RE.test(value);
}

export function otpIsLocked(attempts: number): boolean {
  return attempts >= OTP_MAX_ATTEMPTS;
}

export type OtpVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "OTP_LOCKED" | "OTP_NOT_SET" | "OTP_ALREADY_USED" | "OTP_MISMATCH";
      /** The shared attempts counter AFTER this verdict. */
      attemptsAfter: number;
    };

export function verifyOtp(input: {
  storedOtp: string | null;
  providedOtp: string | null | undefined;
  attempts: number;
  alreadyUsed: boolean;
}): OtpVerdict {
  const attempts = Math.max(0, Math.floor(input.attempts) || 0);
  if (otpIsLocked(attempts)) {
    return { ok: false, code: "OTP_LOCKED", attemptsAfter: attempts };
  }
  if (!input.storedOtp) {
    return { ok: false, code: "OTP_NOT_SET", attemptsAfter: attempts };
  }
  if (input.alreadyUsed) {
    return { ok: false, code: "OTP_ALREADY_USED", attemptsAfter: attempts };
  }
  const provided = (input.providedOtp ?? "").trim();
  if (!isOtpFormat(provided) || provided !== input.storedOtp) {
    return { ok: false, code: "OTP_MISMATCH", attemptsAfter: attempts + 1 };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Order QR — the payload encodes ONLY the order's unguessable         */
/* qr_token (never the sequential order reference), as                 */
/* `zclean:order:<qr_token>`.                                          */
/* ------------------------------------------------------------------ */

export const QR_PAYLOAD_PREFIX = "zclean:order:";

export function qrPayload(qrToken: string): string {
  return `${QR_PAYLOAD_PREFIX}${qrToken}`;
}

/**
 * Extract the token from a scanned payload. A bare token (typed or
 * pasted by staff who can see it on the order) is also accepted; empty
 * input yields null.
 */
export function parseQrPayload(input: string | null | undefined): string | null {
  const value = (input ?? "").trim();
  if (!value) return null;
  if (value.startsWith(QR_PAYLOAD_PREFIX)) {
    const token = value.slice(QR_PAYLOAD_PREFIX.length).trim();
    return token || null;
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Employee eligibility                                                */
/* ------------------------------------------------------------------ */

export interface HandoverEmployeeRef {
  id: string;
  employmentStatus: string;
  roles: readonly string[];
}

export function employeeCanReceive(
  employee: HandoverEmployeeRef,
  point: HandoverPoint,
): { ok: true } | { ok: false; code: "EMPLOYEE_INACTIVE" | "ROLE_MISMATCH" } {
  if (employee.employmentStatus !== "active") {
    return { ok: false, code: "EMPLOYEE_INACTIVE" };
  }
  const allowed = receivingRoles(point);
  if (!employee.roles.some((r) => (allowed as string[]).includes(r))) {
    return { ok: false, code: "ROLE_MISMATCH" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* The master check — used verbatim by the live API route AND the      */
/* demo-mode applier, so both modes enforce identical rules.           */
/* ------------------------------------------------------------------ */

export interface CheckHandoverInput {
  point: HandoverPoint;
  orderStatus: string;
  completedPointIds: ReadonlySet<string>;
  /** The selected receiving employee; null when the id resolved to nobody. */
  employee: (HandoverEmployeeRef & { fullName: string }) | null;
  method: string;
  otpProvided?: string | null;
  storedOtp?: string | null;
  otpAlreadyUsed?: boolean;
  otpAttempts?: number;
  qrProvided?: string | null;
  storedQrToken?: string | null;
  quantity: number;
  expectedQuantity: number;
  reportMissingItem?: boolean;
}

export type CheckHandoverResult =
  | { ok: true; flags: HandoverFlag[]; statusEffect: string | null }
  | {
      ok: false;
      code: string;
      httpStatus: number;
      error: string;
      /** Set on OTP_MISMATCH: persist this as the new attempts counter. */
      otpAttemptsAfter?: number;
    };

function fail(
  code: string,
  httpStatus: number,
  error: string,
  extra?: { otpAttemptsAfter?: number },
): CheckHandoverResult {
  return { ok: false, code, httpStatus, error, ...extra };
}

export function checkHandover(input: CheckHandoverInput): CheckHandoverResult {
  const { point } = input;

  // The point must be this order's next expected point. A point that is
  // already done is a duplicate; anything else is out of sequence.
  if (input.completedPointIds.has(point.id)) {
    return fail(
      "DUPLICATE",
      409,
      `The "${point.label}" handover has already been recorded for this order.`,
    );
  }
  const next = nextHandoverPoint(input.orderStatus, input.completedPointIds);
  if (!next) {
    return fail(
      "OUT_OF_SEQUENCE",
      409,
      "This order is not awaiting any handover (it is finished, cancelled, or still waiting on payment).",
    );
  }
  if (next.id !== point.id) {
    return fail(
      "OUT_OF_SEQUENCE",
      409,
      `This order is waiting for "${next.label}" next, not "${point.label}". Complete the chain in order.`,
    );
  }

  // The receiving employee must exist, be active, and hold the role.
  if (!input.employee) {
    return fail(
      "EMPLOYEE_REQUIRED",
      422,
      "Select the employee who is receiving the items.",
    );
  }
  const eligibility = employeeCanReceive(input.employee, point);
  if (eligibility.ok === false && eligibility.code === "EMPLOYEE_INACTIVE") {
    return fail(
      "EMPLOYEE_INACTIVE",
      409,
      `${input.employee.fullName} is marked inactive and cannot receive handovers.`,
    );
  }
  if (eligibility.ok === false) {
    const wanted = receivingRoles(point).map(staffRoleLabel).join(" or ");
    return fail(
      "ROLE_MISMATCH",
      422,
      `${input.employee.fullName} cannot receive at this point — it needs a ${wanted}.`,
    );
  }

  // Verification method must match the point's method.
  if (input.method !== point.method) {
    return fail(
      "METHOD_MISMATCH",
      422,
      point.method === "otp"
        ? "This handover is verified with the customer's OTP, not a QR scan."
        : "This handover is verified by scanning the order's QR code, not an OTP.",
    );
  }

  if (point.method === "otp") {
    const verdict = verifyOtp({
      storedOtp: input.storedOtp ?? null,
      providedOtp: input.otpProvided,
      attempts: input.otpAttempts ?? 0,
      alreadyUsed: input.otpAlreadyUsed ?? false,
    });
    if (verdict.ok === false) {
      switch (verdict.code) {
        case "OTP_LOCKED":
          return fail(
            "OTP_LOCKED",
            423,
            "Too many wrong OTP attempts — OTP verification is locked for this order. An admin must regenerate the OTP.",
          );
        case "OTP_NOT_SET":
          return fail(
            "OTP_NOT_SET",
            422,
            "This order has no OTP on file. An admin must generate one before this handover can be verified.",
          );
        case "OTP_ALREADY_USED":
          return fail(
            "OTP_ALREADY_USED",
            409,
            "This OTP has already been used.",
          );
        default:
          return fail(
            "OTP_MISMATCH",
            422,
            "That OTP does not match the customer's code. Check it and try again.",
            { otpAttemptsAfter: verdict.attemptsAfter },
          );
      }
    }
  } else {
    if (!input.storedQrToken) {
      return fail(
        "QR_NOT_SET",
        422,
        "This order has no QR token on file, so the scan cannot be verified.",
      );
    }
    const scanned = parseQrPayload(input.qrProvided);
    if (!scanned) {
      return fail(
        "QR_REQUIRED",
        422,
        "Scan the order's QR code (or paste its token) to complete this handover.",
      );
    }
    if (scanned !== input.storedQrToken) {
      return fail(
        "QR_MISMATCH",
        422,
        "That QR code belongs to a different order. Check you have the right bag and try again.",
      );
    }
  }

  // The status effect must be a legal lifecycle move from here.
  if (point.statusEffect && !canTransition(input.orderStatus, point.statusEffect)) {
    return fail(
      "INVALID_TRANSITION",
      422,
      `Completing "${point.label}" would move the order from ${input.orderStatus} to ${point.statusEffect}, which the order lifecycle does not allow. The order's status was probably changed manually — an admin should reconcile it first.`,
    );
  }

  const flags = quantityFlags(input.quantity, input.expectedQuantity);
  if (input.reportMissingItem && !flags.includes("missing_item")) {
    flags.unshift("missing_item");
  }

  return { ok: true, flags, statusEffect: point.statusEffect };
}

/** Guard used by tests + schema writers: every chain role is a real staff role. */
export function chainRolesAreValid(): boolean {
  return HANDOVER_CHAIN.every(
    (p) =>
      (p.fromRole === "customer" || isStaffRole(p.fromRole)) &&
      isStaffRole(p.toRole) &&
      p.alsoToRoles.every((r) => isStaffRole(r)),
  );
}
