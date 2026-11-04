/**
 * Order status flow (Phase 4) — the single source of truth for which
 * status an order may move to next. Used by:
 *   - the admin PATCH route (server-side validation of every transition),
 *   - the admin UI (offers ONLY the statuses `nextStatuses` returns),
 *   - the demo store (same rules for demo admin changes),
 *   - the customer tracking timeline (canonical step order + labels).
 *
 * Canonical happy path (ARCHITECTURE.md §5):
 *   PLACED -> PICKUP_SCHEDULED -> PICKED_UP -> RECEIVED -> IN_PROCESS
 *   -> READY -> OUT_FOR_DELIVERY -> DELIVERED
 *
 * Rules:
 *   - Forward moves must follow the path exactly — no skipping a step,
 *     no going backwards, no staying in place.
 *   - CANCELLED is allowed only from PLACED or PICKUP_SCHEDULED
 *     (i.e. before the laundry has been picked up).
 *   - DELIVERED and CANCELLED are terminal.
 *   - PAYMENT_PENDING / PAYMENT_FAILED / REFUNDED are payment SIDE
 *     states: they are not timeline steps and have no outgoing
 *     transitions here. Money state is owned by the Razorpay webhook
 *     (paid) and the COD collection action (PATCH codCollected flag),
 *     never by status moves.
 */

export interface OrderStep {
  status: string;
  label: string;
  hint: string;
}

export const ORDER_STEPS: OrderStep[] = [
  { status: "PLACED", label: "Order placed", hint: "We have received your order." },
  { status: "PICKUP_SCHEDULED", label: "Pickup scheduled", hint: "Your pickup slot is booked." },
  { status: "PICKED_UP", label: "Picked up", hint: "Your laundry is with our rider." },
  { status: "RECEIVED", label: "Received at our store", hint: "Your items have been checked in." },
  { status: "IN_PROCESS", label: "Cleaning in progress", hint: "Sorting, stain treatment, washing / dry cleaning, finishing and quality check." },
  { status: "READY", label: "Ready", hint: "Clean, packed and ready to head back to you." },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery", hint: "Your laundry is on its way to you." },
  { status: "DELIVERED", label: "Delivered", hint: "Handed over. Enjoy the freshness!" },
];

/** Statuses that exist on orders but are NOT steps of the timeline. */
export const SIDE_STATUSES = [
  "CANCELLED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "REFUNDED",
] as const;

/** Every status an order can carry (canonical steps + side states). */
export const ALL_ORDER_STATUSES: string[] = [
  ...ORDER_STEPS.map((s) => s.status),
  ...SIDE_STATUSES,
];

const NEXT: Record<string, string[]> = {
  PLACED: ["PICKUP_SCHEDULED", "CANCELLED"],
  PICKUP_SCHEDULED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["RECEIVED"],
  RECEIVED: ["IN_PROCESS"],
  IN_PROCESS: ["READY"],
  READY: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  PAYMENT_PENDING: [],
  PAYMENT_FAILED: [],
  REFUNDED: [],
};

/** The statuses `from` may legally move to (empty for terminal/side). */
export function nextStatuses(from: string): string[] {
  return [...(NEXT[from] ?? [])];
}

/** True iff moving an order from `from` to `to` follows the rules above. */
export function canTransition(from: string, to: string): boolean {
  if (from === to) return false;
  return (NEXT[from] ?? []).includes(to);
}

/**
 * Index of a status in the canonical timeline, or -1 for side states
 * (CANCELLED, PAYMENT_PENDING, PAYMENT_FAILED, REFUNDED, unknown).
 */
export function stepIndex(status: string): number {
  return ORDER_STEPS.findIndex((s) => s.status === status);
}

/** Customer-friendly label for any known status. */
export function statusLabel(status: string): string {
  const step = ORDER_STEPS.find((s) => s.status === status);
  if (step) return step.label;
  return status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function isTerminal(status: string): boolean {
  return status === "DELIVERED" || status === "CANCELLED";
}
