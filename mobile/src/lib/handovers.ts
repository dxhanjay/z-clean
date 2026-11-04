/**
 * The handover chain as data (Mobile Phase 2).
 *
 * Ported from the web app's src/lib/handovers.ts (Phase 8) — the
 * chain, flag vocabulary and labels are identical so app and web
 * screens describe the same workflow. The SERVER derives each
 * order's next point and validates every completion; this copy only
 * drives presentation (labels, role names, flag text).
 */

export interface HandoverPointDef {
  id: string;
  label: string;
  stage: string | null;
  fromLabel: string;
  toRole: string;
  alsoToRoles: string[];
  toLabel: string;
  method: "qr" | "otp";
  otpKind: "pickup" | "delivery" | null;
  statusEffect: string | null;
}

export const HANDOVER_CHAIN: HandoverPointDef[] = [
  { id: "pickup", label: "Pickup from customer", stage: null, fromLabel: "Customer", toRole: "picker", alsoToRoles: [], toLabel: "Picker", method: "otp", otpKind: "pickup", statusEffect: "PICKED_UP" },
  { id: "picker_to_centre", label: "Picker hands over to Collection Center", stage: null, fromLabel: "Picker", toRole: "collection_center", alsoToRoles: [], toLabel: "Collection Center", method: "qr", otpKind: null, statusEffect: null },
  { id: "centre_to_plant", label: "Collection Center / Inbound Transport to Plant", stage: null, fromLabel: "Collection Center / Inbound Transporter", toRole: "plant_manager", alsoToRoles: [], toLabel: "Plant Manager", method: "qr", otpKind: null, statusEffect: "RECEIVED" },
  { id: "plant_sorting", label: "Sorting & Inspection → Stain Treatment", stage: "Sorting & Inspection", fromLabel: "Plant Manager", toRole: "washerman", alsoToRoles: [], toLabel: "Washerman", method: "qr", otpKind: null, statusEffect: "IN_PROCESS" },
  { id: "plant_stain", label: "Stain Treatment → Processing", stage: "Stain Treatment", fromLabel: "Washerman", toRole: "washerman", alsoToRoles: [], toLabel: "Washerman", method: "qr", otpKind: null, statusEffect: null },
  { id: "plant_processing", label: "Processing → Finishing", stage: "Processing", fromLabel: "Washerman", toRole: "ironing_staff", alsoToRoles: [], toLabel: "Ironing Staff", method: "qr", otpKind: null, statusEffect: null },
  { id: "plant_finishing", label: "Finishing → Quality Check", stage: "Finishing", fromLabel: "Ironing Staff", toRole: "quality_checker", alsoToRoles: [], toLabel: "Quality Checker", method: "qr", otpKind: null, statusEffect: null },
  { id: "plant_qc", label: "Quality Check → Packing", stage: "Quality Check", fromLabel: "Quality Checker", toRole: "packer", alsoToRoles: [], toLabel: "Packer", method: "qr", otpKind: null, statusEffect: null },
  { id: "plant_packing", label: "Packing complete — ready for dispatch", stage: "Packing", fromLabel: "Packer", toRole: "packer", alsoToRoles: [], toLabel: "Packer", method: "qr", otpKind: null, statusEffect: "READY" },
  { id: "packer_to_outbound", label: "Packer hands over to Outbound Transport", stage: null, fromLabel: "Packer", toRole: "transporter_outbound", alsoToRoles: [], toLabel: "Outbound Transporter", method: "qr", otpKind: null, statusEffect: "OUT_FOR_DELIVERY" },
  { id: "delivery", label: "Delivery to customer", stage: null, fromLabel: "Outbound Transporter / Home Delivery Staff", toRole: "delivery_staff", alsoToRoles: ["transporter_outbound"], toLabel: "Customer", method: "otp", otpKind: "delivery", statusEffect: "DELIVERED" },
];

export function handoverPoint(id: string): HandoverPointDef | null {
  return HANDOVER_CHAIN.find((p) => p.id === id) ?? null;
}

/** Roles allowed to RECEIVE at a point (primary + alternates). */
export function receivingRoles(point: { toRole: string; alsoToRoles: string[] }): string[] {
  return [point.toRole, ...point.alsoToRoles];
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

export const OTP_MAX_ATTEMPTS = 5;
