/**
 * DEMO MODE handovers store + applier (Phase 8).
 *
 * Same honesty pattern as the other demo stores: handovers recorded
 * here live only in this browser's localStorage, under the DEMO MODE
 * banner, and never touch a server. The RULES are not a demo
 * re-implementation — `applyDemoHandover` runs the exact same pure
 * validator as the live API route (checkHandover in
 * src/lib/handovers.ts) and mirrors the route's write sequence
 * (ledger row → order effects → history events), so demo behaviour
 * and live behaviour cannot drift apart.
 */

import {
  checkHandover,
  completedPointIds,
  generateOtp,
  handoverPoint,
  nextHandoverPoint,
  orderItemCount,
  type HandoverFlag,
  type HandoverPoint,
} from "./handovers";
import {
  getDemoOrder,
  saveDemoOrder,
  type DemoOrder,
} from "./demo-store";
import { listDemoEmployees, newDemoId } from "./demo-org";

export interface DemoHandover {
  id: string;
  orderId: string;
  pointId: string;
  fromStage: string;
  toStage: string;
  method: "qr" | "otp";
  fromEmployeeId: string | null;
  fromEmployeeName: string | null;
  toEmployeeId: string;
  toEmployeeName: string;
  actorLabel: string;
  quantity: number;
  expectedQuantity: number;
  flags: HandoverFlag[];
  note: string | null;
  createdAt: string;
}

const HANDOVERS_KEY = "zclean_demo_handovers_v1";

function readAll(): DemoHandover[] {
  try {
    const raw = window.localStorage.getItem(HANDOVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoHandover[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: DemoHandover[]): void {
  try {
    window.localStorage.setItem(HANDOVERS_KEY, JSON.stringify(rows));
  } catch {
    // Storage unavailable — the in-memory flow still completes.
  }
}

export function listDemoHandovers(orderId?: string): DemoHandover[] {
  const rows = readAll().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return orderId ? rows.filter((h) => h.orderId === orderId) : rows;
}

export interface DemoHandoverInput {
  pointId: string;
  toEmployeeId: string;
  method: "qr" | "otp";
  otp?: string;
  qrToken?: string;
  quantity?: number;
  codCollected?: boolean;
  missingItem?: boolean;
  note?: string;
}

export type DemoHandoverResult =
  | {
      ok: true;
      order: DemoOrder;
      handover: DemoHandover;
      nextPoint: HandoverPoint | null;
    }
  | { ok: false; error: string; code?: string };

export function applyDemoHandover(
  orderId: string,
  input: DemoHandoverInput,
): DemoHandoverResult {
  const order = getDemoOrder(orderId);
  if (!order) return { ok: false, error: "Demo order not found." };
  const point = handoverPoint(input.pointId);
  if (!point) {
    return { ok: false, error: `Unknown handover point "${input.pointId}".`, code: "UNKNOWN_POINT" };
  }

  const prior = listDemoHandovers(orderId);
  const completed = completedPointIds(prior);
  const expectedQuantity = orderItemCount(order.items);
  const quantity = input.quantity ?? expectedQuantity;

  const employeeRow = listDemoEmployees().find((e) => e.id === input.toEmployeeId);
  const employee = employeeRow
    ? {
        id: employeeRow.id,
        fullName: employeeRow.fullName,
        employmentStatus: employeeRow.employmentStatus,
        roles: employeeRow.roles as unknown as string[],
      }
    : null;

  const wantsCod = Boolean(input.codCollected);
  if (wantsCod && point.id !== "delivery") {
    return {
      ok: false,
      error: "COD collection can only be recorded at the delivery handover.",
      code: "COD_WRONG_POINT",
    };
  }
  if (wantsCod && !(order.paymentMethod === "cod" && order.paymentStatus === "cod_pending")) {
    return {
      ok: false,
      error: "COD collection can only be recorded on a Pay-on-Delivery order that is still unpaid.",
      code: "COD_NOT_PENDING",
    };
  }

  const check = checkHandover({
    point,
    orderStatus: order.status,
    completedPointIds: completed,
    employee,
    method: input.method,
    otpProvided: input.otp || null,
    storedOtp:
      point.otpKind === "pickup"
        ? (order.pickupOtp ?? null)
        : point.otpKind === "delivery"
          ? (order.deliveryOtp ?? null)
          : null,
    otpAlreadyUsed:
      point.otpKind === "pickup"
        ? Boolean(order.pickupOtpUsedAt)
        : point.otpKind === "delivery"
          ? Boolean(order.deliveryOtpUsedAt)
          : false,
    otpAttempts: order.otpAttempts ?? 0,
    qrProvided: input.qrToken || null,
    storedQrToken: order.qrToken ?? null,
    quantity,
    expectedQuantity,
    reportMissingItem: Boolean(input.missingItem),
  });

  if (check.ok === false) {
    if (check.code === "OTP_MISMATCH" && check.otpAttemptsAfter !== undefined) {
      saveDemoOrder({ ...order, otpAttempts: check.otpAttemptsAfter });
    }
    return { ok: false, error: check.error, code: check.code };
  }

  const now = new Date().toISOString();
  const previous = prior[prior.length - 1];
  const handover: DemoHandover = {
    id: newDemoId("hnd"),
    orderId,
    pointId: point.id,
    fromStage: point.fromLabel,
    toStage: point.toLabel,
    method: point.method,
    fromEmployeeId: previous?.toEmployeeId ?? null,
    fromEmployeeName: previous?.toEmployeeName ?? null,
    toEmployeeId: employee!.id,
    toEmployeeName: employee!.fullName,
    actorLabel: "demo admin",
    quantity,
    expectedQuantity,
    flags: check.flags,
    note: input.note?.trim() ? input.note.trim() : null,
    createdAt: now,
  };
  writeAll([...readAll(), handover]);

  const nextStatus = check.statusEffect ?? order.status;
  const history = [...order.history];
  history.push({
    status: nextStatus,
    note:
      `Handover — ${point.label}: ${point.fromLabel} → ${employee!.fullName} (${point.toLabel}), ` +
      `${quantity} item${quantity === 1 ? "" : "s"} via ${point.method === "otp" ? "customer OTP" : "QR scan"}` +
      (check.flags.length ? ` [flags: ${check.flags.join(", ")}]` : "") +
      (handover.note ? ` — ${handover.note}` : "") +
      " (demo)",
    actor: "admin",
    at: now,
  });
  if (wantsCod) {
    history.push({
      status: nextStatus,
      note: "COD collected — payment received in full (demo, recorded at the delivery handover).",
      actor: "admin",
      at: now,
    });
  }

  const updated: DemoOrder = {
    ...order,
    status: nextStatus,
    paymentStatus: wantsCod ? "paid" : order.paymentStatus,
    pickupOtpUsedAt:
      point.otpKind === "pickup" ? now : (order.pickupOtpUsedAt ?? null),
    deliveryOtpUsedAt:
      point.otpKind === "delivery" ? now : (order.deliveryOtpUsedAt ?? null),
    history,
  };
  saveDemoOrder(updated);

  return {
    ok: true,
    order: updated,
    handover,
    nextPoint: nextHandoverPoint(
      nextStatus,
      completedPointIds([...prior, handover]),
    ),
  };
}

/** Demo twin of the regenerate-otp route: fresh code + attempts reset. */
export function regenerateDemoOtp(
  orderId: string,
  which: "pickup" | "delivery",
): { ok: true; otp: string } | { ok: false; error: string } {
  const order = getDemoOrder(orderId);
  if (!order) return { ok: false, error: "Demo order not found." };
  const otp = generateOtp();
  saveDemoOrder({
    ...order,
    ...(which === "pickup"
      ? { pickupOtp: otp, pickupOtpUsedAt: null }
      : { deliveryOtp: otp, deliveryOtpUsedAt: null }),
    otpAttempts: 0,
  });
  return { ok: true, otp };
}
