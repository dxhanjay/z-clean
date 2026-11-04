/**
 * DEMO MODE browser storage.
 *
 * Used ONLY when Supabase is not configured (no NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY) or, for dashboard data, when nobody is
 * signed in. Records created here live in this browser's localStorage and
 * are NEVER presented as server-saved data — every screen that uses this
 * store is badged "DEMO MODE". When Supabase env vars are set, the real
 * API routes + RLS-protected tables take over.
 */

import { canTransition, nextStatuses } from "./order-flow";
import { generateOtp } from "./handovers";

export interface PickupRequest {
  ref: string;
  name: string;
  phone: string;
  addressLine: string;
  area: string;
  city: string;
  pincode: string;
  services: string[];
  pickupDate: string; // yyyy-mm-dd
  pickupSlot: string;
  deliveryType: "regular" | "express";
  note?: string;
  status: string;
  createdAt: string; // ISO
  source: "demo";
}

export interface DemoAddress {
  id: string;
  label: string;
  line: string;
  area: string;
  city: string;
  pincode: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Demo orders (Phase 3). Same honesty rules as pickups/addresses:     */
/* these live in localStorage, are always badged DEMO MODE, and demo   */
/* "payments" are explicit simulations — never real charges.           */
/* ------------------------------------------------------------------ */

/**
 * One entry of a demo order's status history (Phase 4) — the demo twin
 * of the live `order_status_history` table. The customer timeline and
 * the demo admin panel both read this array.
 */
export interface DemoHistoryEvent {
  status: string;
  note?: string;
  /** Who made the change: the customer, an admin, or the system. */
  actor: "customer" | "admin" | "system";
  at: string; // ISO
}

export interface DemoOrderItem {
  serviceSlug: string;
  itemName: string;
  qty: number;
  unitLabel: string;
  unitPricePaise: number;
  lineTotalPaise: number;
}

export type DemoPaymentStatus =
  | "pending"
  | "cod_pending"
  | "paid"
  | "failed"
  // Phase 9: derived by the finance engine (src/lib/finance.ts) when a
  // demo payment entry settles part of the bill, or a refund returns
  // all of it.
  | "partially_paid"
  | "refunded";

export interface DemoOrder {
  id: string;
  name: string;
  phone: string;
  addressLine: string;
  area: string;
  city: string;
  pincode: string;
  pickupDate: string;
  pickupSlot: string;
  deliveryType: "regular" | "express";
  note?: string;
  items: DemoOrderItem[];
  couponCode?: string;
  subtotalPaise: number;
  discountPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  paymentMethod: "razorpay" | "cod";
  paymentStatus: DemoPaymentStatus;
  status: string;
  /** Status history, oldest first (Phase 4). Always present after read. */
  history: DemoHistoryEvent[];
  /**
   * Phase 8 handover credentials — the demo twins of the orders
   * columns. Optional because orders stored before Phase 8 lack them;
   * `withHandoverCodes` fills + persists them on first read so a demo
   * OTP never changes between page loads.
   */
  qrToken?: string;
  pickupOtp?: string;
  deliveryOtp?: string;
  pickupOtpUsedAt?: string | null;
  deliveryOtpUsedAt?: string | null;
  otpAttempts?: number;
  createdAt: string;
  source: "demo";
}

const PICKUPS_KEY = "zclean_demo_pickups_v1";
const ADDRESSES_KEY = "zclean_demo_addresses_v1";
const ORDERS_KEY = "zclean_demo_orders_v1";

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, rows: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(rows));
}

export function makeDemoRef(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

export function listDemoPickups(): PickupRequest[] {
  return read<PickupRequest>(PICKUPS_KEY).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function addDemoPickup(
  data: Omit<PickupRequest, "ref" | "status" | "createdAt" | "source">,
): PickupRequest {
  const record: PickupRequest = {
    ...data,
    ref: makeDemoRef("DEMO"),
    status: "PICKUP_SCHEDULED",
    createdAt: new Date().toISOString(),
    source: "demo",
  };
  write(PICKUPS_KEY, [record, ...read<PickupRequest>(PICKUPS_KEY)]);
  return record;
}

/**
 * Orders written before Phase 4 have no `history` array. Synthesize the
 * creation event from the order itself so their timeline still renders.
 */
function withHistory(order: DemoOrder): DemoOrder {
  if (Array.isArray(order.history) && order.history.length > 0) return order;
  return {
    ...order,
    history: [
      {
        status: order.status,
        note:
          order.paymentMethod === "cod"
            ? "Order placed — pay on delivery (demo)."
            : "Order placed (demo).",
        actor: "customer",
        at: order.createdAt,
      },
    ],
  };
}

/**
 * Phase 8: fill any missing handover credentials. Returns the order
 * plus whether anything changed (callers that read a single order
 * persist the fill so the codes are stable across page loads).
 */
function withHandoverCodes(order: DemoOrder): { order: DemoOrder; changed: boolean } {
  if (
    order.qrToken &&
    order.pickupOtp &&
    order.deliveryOtp &&
    order.otpAttempts !== undefined
  ) {
    return { order, changed: false };
  }
  return {
    order: {
      ...order,
      qrToken: order.qrToken ?? makeDemoRef("QRTOKEN"),
      pickupOtp: order.pickupOtp ?? generateOtp(),
      deliveryOtp: order.deliveryOtp ?? generateOtp(),
      pickupOtpUsedAt: order.pickupOtpUsedAt ?? null,
      deliveryOtpUsedAt: order.deliveryOtpUsedAt ?? null,
      otpAttempts: order.otpAttempts ?? 0,
    },
    changed: true,
  };
}

export function listDemoOrders(): DemoOrder[] {
  return read<DemoOrder>(ORDERS_KEY)
    .map(withHistory)
    .map((o) => withHandoverCodes(o).order)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDemoOrder(id: string): DemoOrder | undefined {
  const rows = read<DemoOrder>(ORDERS_KEY);
  const idx = rows.findIndex((o) => o.id === id);
  if (idx === -1) return undefined;
  const { order, changed } = withHandoverCodes(withHistory(rows[idx]));
  if (changed) {
    rows[idx] = order;
    write(ORDERS_KEY, rows);
  }
  return order;
}

/** Replace a demo order wholesale (Phase 8 handover applier). */
export function saveDemoOrder(order: DemoOrder): void {
  const rows = read<DemoOrder>(ORDERS_KEY);
  const idx = rows.findIndex((o) => o.id === order.id);
  if (idx === -1) return;
  rows[idx] = order;
  write(ORDERS_KEY, rows);
}

export function addDemoOrder(
  data: Omit<
    DemoOrder,
    | "id"
    | "createdAt"
    | "source"
    | "history"
    | "qrToken"
    | "pickupOtp"
    | "deliveryOtp"
    | "pickupOtpUsedAt"
    | "deliveryOtpUsedAt"
    | "otpAttempts"
  >,
): DemoOrder {
  const now = new Date().toISOString();
  const record: DemoOrder = {
    ...data,
    id: makeDemoRef("ORD"),
    createdAt: now,
    source: "demo",
    qrToken: makeDemoRef("QRTOKEN"),
    pickupOtp: generateOtp(),
    deliveryOtp: generateOtp(),
    pickupOtpUsedAt: null,
    deliveryOtpUsedAt: null,
    otpAttempts: 0,
    history: [
      {
        status: data.status,
        note:
          data.paymentMethod === "cod"
            ? "Order placed — pay on delivery (demo)."
            : "Order placed — awaiting online payment (demo).",
        actor: "customer",
        at: now,
      },
    ],
  };
  write(ORDERS_KEY, [record, ...read<DemoOrder>(ORDERS_KEY)]);
  return record;
}

export function updateDemoOrder(
  id: string,
  patch: Partial<Pick<DemoOrder, "paymentStatus" | "status">>,
  historyEvent?: Omit<DemoHistoryEvent, "at">,
): DemoOrder | undefined {
  const rows = read<DemoOrder>(ORDERS_KEY);
  const idx = rows.findIndex((o) => o.id === id);
  if (idx === -1) return undefined;
  const current = withHistory(rows[idx]);
  rows[idx] = {
    ...current,
    ...patch,
    history: historyEvent
      ? [...current.history, { ...historyEvent, at: new Date().toISOString() }]
      : current.history,
  };
  write(ORDERS_KEY, rows);
  return rows[idx];
}

/* ------------------------------------------------------------------ */
/* Phase 4 — demo admin status changes. The same order-flow rules as   */
/* the live PATCH route are enforced here (via canTransition), and     */
/* every accepted change appends a history event, so the demo admin →  */
/* customer timeline loop works end-to-end in a single browser.        */
/* ------------------------------------------------------------------ */

export type DemoStatusChangeResult =
  | { ok: true; order: DemoOrder }
  | { ok: false; error: string };

export function applyDemoStatusChange(
  id: string,
  change: { status?: string; note?: string; codCollected?: boolean },
): DemoStatusChangeResult {
  const rows = read<DemoOrder>(ORDERS_KEY);
  const idx = rows.findIndex((o) => o.id === id);
  if (idx === -1) return { ok: false, error: "Demo order not found." };
  const order = withHistory(rows[idx]);

  const wantsStatusChange =
    change.status !== undefined && change.status !== order.status;
  if (change.status !== undefined && change.status === order.status && !change.codCollected) {
    return { ok: false, error: "Pick a new status, or record the COD collection." };
  }
  if (wantsStatusChange && !canTransition(order.status, change.status!)) {
    const allowed = nextStatuses(order.status);
    return {
      ok: false,
      error: `Cannot move from ${order.status} to ${change.status}.` +
        (allowed.length ? ` Allowed next: ${allowed.join(", ")}.` : " This order is finished."),
    };
  }
  if (change.codCollected && !(order.paymentMethod === "cod" && order.paymentStatus === "cod_pending")) {
    return { ok: false, error: "COD collection can only be recorded on a Pay-on-Delivery order that is still unpaid." };
  }

  const now = new Date().toISOString();
  const events: DemoHistoryEvent[] = [];
  const nextStatus = wantsStatusChange ? change.status! : order.status;
  if (wantsStatusChange) {
    events.push({
      status: nextStatus,
      note: change.note?.trim() || undefined,
      actor: "admin",
      at: now,
    });
  }
  if (change.codCollected) {
    events.push({
      status: nextStatus,
      note: "COD collected — payment received in full (demo, marked by admin).",
      actor: "admin",
      at: now,
    });
  }
  if (events.length === 0) {
    return { ok: false, error: "Nothing to change." };
  }

  const updated: DemoOrder = {
    ...order,
    status: nextStatus,
    paymentStatus: change.codCollected ? "paid" : order.paymentStatus,
    history: [...order.history, ...events],
  };
  rows[idx] = updated;
  write(ORDERS_KEY, rows);
  return { ok: true, order: updated };
}

export function listDemoAddresses(): DemoAddress[] {
  return read<DemoAddress>(ADDRESSES_KEY);
}

export function addDemoAddress(
  data: Omit<DemoAddress, "id" | "createdAt">,
): DemoAddress {
  const record: DemoAddress = {
    ...data,
    id: makeDemoRef("ADDR"),
    createdAt: new Date().toISOString(),
  };
  write(ADDRESSES_KEY, [...read<DemoAddress>(ADDRESSES_KEY), record]);
  return record;
}
