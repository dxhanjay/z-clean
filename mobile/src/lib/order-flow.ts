/**
 * Order status flow — MOBILE PORT of the web app's
 * src/lib/order-flow.ts (labels, canonical step order and the
 * legal-transition map). The server enforces the same rules on
 * every admin PATCH; this copy drives the timeline display and the
 * admin action buttons so the app never offers an illegal move.
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

export const SIDE_STATUSES = ["CANCELLED", "PAYMENT_PENDING", "PAYMENT_FAILED", "REFUNDED"] as const;

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

export function stepIndex(status: string): number {
  return ORDER_STEPS.findIndex((s) => s.status === status);
}

/** Customer-friendly label for any known status. */
export function statusLabel(status: string): string {
  const step = ORDER_STEPS.find((s) => s.status === status);
  if (step) return step.label;
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Pickup slots — mirror of the web PICKUP_SLOTS (zod enum on the server). */
export const PICKUP_SLOTS = [
  "9 AM – 11 AM",
  "11 AM – 1 PM",
  "1 PM – 3 PM",
  "3 PM – 5 PM",
  "5 PM – 7 PM",
  "7 PM – 9 PM",
] as const;
