/**
 * DEMO MODE finance store (Phase 9).
 *
 * The browser twin of payment_entries / refunds / expenses /
 * cash_closings: same shapes, same pure math (src/lib/finance.ts),
 * stored only in this browser's localStorage under the DEMO MODE
 * banner. Seeds are EMPTY — demo finance starts with no movements,
 * exactly like a fresh live database; nothing here is presented as
 * server data.
 */

import {
  computeOrderFinance,
  type OrderFinance,
} from "./finance";
import type { DemoOrder } from "./demo-store";
import { newDemoId } from "./demo-org";

export interface DemoPaymentEntry {
  id: string;
  orderId: string;
  entryType: "payment" | "refund";
  method: string;
  amountPaise: number;
  reference: string | null;
  note: string | null;
  recordedByEmployeeId: string | null;
  recordedByEmployeeName: string | null;
  actorLabel: string | null;
  createdAt: string;
}

export interface DemoRefund {
  id: string;
  orderId: string;
  amountPaise: number;
  reason: string;
  method: string;
  status: "requested" | "approved" | "rejected" | "processed";
  requestedByLabel: string | null;
  decidedByLabel: string | null;
  decidedAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface DemoExpense {
  id: string;
  expenseDate: string;
  category: string;
  description: string | null;
  amountPaise: number;
  branchId: string | null;
  branchName: string | null;
  actorLabel: string | null;
  createdAt: string;
}

export interface DemoCashClosing {
  id: string;
  date: string;
  expectedCashPaise: number;
  countedCashPaise: number;
  differencePaise: number;
  closedByLabel: string | null;
  note: string | null;
  createdAt: string;
}

const ENTRIES_KEY = "zclean_demo_payment_entries_v1";
const REFUNDS_KEY = "zclean_demo_refunds_v1";
const EXPENSES_KEY = "zclean_demo_expenses_v1";
const CLOSINGS_KEY = "zclean_demo_cash_closings_v1";

function read<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      window.localStorage.setItem(key, "[]");
      return [];
    }
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, rows: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Storage unavailable — in-memory state still drives the UI.
  }
}

/* ------------------------------------------------------------------ */
/* Payment entries                                                     */
/* ------------------------------------------------------------------ */

export function listDemoPaymentEntries(orderId?: string): DemoPaymentEntry[] {
  const rows = read<DemoPaymentEntry>(ENTRIES_KEY);
  return orderId ? rows.filter((e) => e.orderId === orderId) : rows;
}

export function addDemoPaymentEntry(
  entry: Omit<DemoPaymentEntry, "id" | "createdAt">,
): DemoPaymentEntry {
  const row: DemoPaymentEntry = {
    ...entry,
    id: newDemoId("entry"),
    createdAt: new Date().toISOString(),
  };
  write(ENTRIES_KEY, [...read<DemoPaymentEntry>(ENTRIES_KEY), row]);
  return row;
}

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

export function listDemoRefunds(orderId?: string): DemoRefund[] {
  const rows = read<DemoRefund>(REFUNDS_KEY);
  return orderId ? rows.filter((r) => r.orderId === orderId) : rows;
}

export function addDemoRefund(
  refund: Omit<DemoRefund, "id" | "createdAt" | "status" | "decidedByLabel" | "decidedAt" | "processedAt">,
): DemoRefund {
  const row: DemoRefund = {
    ...refund,
    id: newDemoId("refund"),
    status: "requested",
    decidedByLabel: null,
    decidedAt: null,
    processedAt: null,
    createdAt: new Date().toISOString(),
  };
  write(REFUNDS_KEY, [...read<DemoRefund>(REFUNDS_KEY), row]);
  return row;
}

export function updateDemoRefund(
  id: string,
  patch: Partial<DemoRefund>,
): DemoRefund | null {
  const rows = read<DemoRefund>(REFUNDS_KEY);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...patch };
  write(REFUNDS_KEY, rows);
  return rows[idx];
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export function listDemoExpenses(): DemoExpense[] {
  return read<DemoExpense>(EXPENSES_KEY).sort((a, b) =>
    b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt),
  );
}

export function addDemoExpense(
  expense: Omit<DemoExpense, "id" | "createdAt">,
): DemoExpense {
  const row: DemoExpense = {
    ...expense,
    id: newDemoId("expense"),
    createdAt: new Date().toISOString(),
  };
  write(EXPENSES_KEY, [...read<DemoExpense>(EXPENSES_KEY), row]);
  return row;
}

export function deleteDemoExpense(id: string): void {
  write(EXPENSES_KEY, read<DemoExpense>(EXPENSES_KEY).filter((e) => e.id !== id));
}

/* ------------------------------------------------------------------ */
/* Cash closings                                                       */
/* ------------------------------------------------------------------ */

export function listDemoClosings(): DemoCashClosing[] {
  return read<DemoCashClosing>(CLOSINGS_KEY).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}

export function addDemoClosing(
  closing: Omit<DemoCashClosing, "id" | "createdAt">,
): DemoCashClosing {
  const row: DemoCashClosing = {
    ...closing,
    id: newDemoId("closing"),
    createdAt: new Date().toISOString(),
  };
  write(CLOSINGS_KEY, [...read<DemoCashClosing>(CLOSINGS_KEY), row]);
  return row;
}

/* ------------------------------------------------------------------ */
/* Per-order finance for a demo order                                  */
/* ------------------------------------------------------------------ */

/**
 * Demo orders carry no gateway rows (a demo "paid" COD/online order is
 * settled by the legacy rule in finance.ts, exactly like a v1 order).
 */
export function demoOrderFinance(order: DemoOrder): OrderFinance {
  return computeOrderFinance(
    { totalPaise: order.totalPaise, paymentStatus: order.paymentStatus },
    [],
    listDemoPaymentEntries(order.id),
    listDemoRefunds(order.id),
  );
}
