/**
 * DEMO MODE organisation store (Phase 7a).
 *
 * When Supabase is not configured, the admin Branches / Employees
 * screens run on this browser's localStorage, seeded from the demo
 * records in src/lib/org.ts — the same honesty pattern as
 * src/lib/demo-store.ts: demo data lives only in this browser, is
 * always under the DEMO MODE banner, and is never presented as
 * server-saved. When Supabase is configured, the /api/admin/branches
 * and /api/admin/employees routes + RLS tables take over instead.
 */

import {
  DEMO_BRANCHES,
  DEMO_EMPLOYEES,
  type Branch,
  type Employee,
} from "./org";
import {
  DEMO_VOUCHER_TRANSACTIONS,
  DEMO_VOUCHERS,
  type GiftVoucher,
  type VoucherTransaction,
} from "./vouchers";
import { priceGroups } from "./pricing";

const BRANCHES_KEY = "zclean_demo_branches_v1";
const EMPLOYEES_KEY = "zclean_demo_employees_v1";

function read<T extends { id: string }>(key: string, seed: T[]): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      window.localStorage.setItem(key, JSON.stringify(seed));
      return [...seed];
    }
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [...seed];
  } catch {
    return [...seed];
  }
}

function write<T>(key: string, rows: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Storage full / unavailable — the in-memory state still drives the UI.
  }
}

/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

export function listDemoBranches(): Branch[] {
  return read(BRANCHES_KEY, DEMO_BRANCHES);
}

export function saveDemoBranches(rows: Branch[]): void {
  write(BRANCHES_KEY, rows);
}

/* ------------------------------------------------------------------ */
/* Employees                                                           */
/* ------------------------------------------------------------------ */

export function listDemoEmployees(): Employee[] {
  return read(EMPLOYEES_KEY, DEMO_EMPLOYEES);
}

export function saveDemoEmployees(rows: Employee[]): void {
  write(EMPLOYEES_KEY, rows);
}

/** Recompute display names (branch / manager) after any demo mutation. */
export function withDemoNames(employees: Employee[], branches: Branch[]): Employee[] {
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const empName = new Map(employees.map((e) => [e.id, e.fullName]));
  return employees.map((e) => ({
    ...e,
    branchName: e.branchId ? (branchName.get(e.branchId) ?? null) : null,
    managerName: e.managerId ? (empName.get(e.managerId) ?? null) : null,
  }));
}

/* ------------------------------------------------------------------ */
/* Phase 7b demo stores: vouchers, pricing editor, settings editor.    */
/* Same honesty pattern: browser-only, under the DEMO MODE banner.     */
/* ------------------------------------------------------------------ */

const VOUCHERS_KEY = "zclean_demo_vouchers_v1";
const VOUCHER_TXNS_KEY = "zclean_demo_voucher_txns_v1";
const PRICING_KEY = "zclean_demo_pricing_v1";
const SETTINGS_KEY = "zclean_demo_settings_v1";

function readJson<T>(key: string, seed: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      window.localStorage.setItem(key, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw) as T;
  } catch {
    return seed;
  }
}

export type DemoVoucher = GiftVoucher & { branchName: string | null };

const DEMO_VOUCHER_SEED: DemoVoucher[] = DEMO_VOUCHERS.map((v) => ({
  ...v,
  branchName: null,
}));

export function listDemoVouchers(): DemoVoucher[] {
  return readJson<DemoVoucher[]>(VOUCHERS_KEY, DEMO_VOUCHER_SEED);
}

export function saveDemoVouchers(rows: DemoVoucher[]): void {
  write(VOUCHERS_KEY, rows);
}

export function listDemoVoucherTransactions(): VoucherTransaction[] {
  return readJson<VoucherTransaction[]>(VOUCHER_TXNS_KEY, DEMO_VOUCHER_TRANSACTIONS);
}

export function saveDemoVoucherTransactions(rows: VoucherTransaction[]): void {
  write(VOUCHER_TXNS_KEY, rows);
}

export function newDemoId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newDemoTxn(
  partial: Omit<VoucherTransaction, "id" | "createdAt">,
): VoucherTransaction {
  return { ...partial, id: newDemoId("txn"), createdAt: new Date().toISOString() };
}

export interface DemoPriceItem {
  id: string;
  itemName: string;
  /** Rupees (the static catalogue speaks rupees; the live API speaks paise). */
  priceInr: number;
  unitLabel: string;
  expressMultiplier: number;
  active: boolean;
}

export interface DemoPricingGroup {
  serviceSlug: string;
  title: string;
  unitNote: string;
  items: DemoPriceItem[];
}

const DEMO_PRICING_SEED: DemoPricingGroup[] = priceGroups.map((g) => ({
  serviceSlug: g.serviceSlug,
  title: g.title,
  unitNote: g.unitNote,
  items: g.items.map((item) => ({
    id: `${g.serviceSlug}:${item.itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    itemName: item.itemName,
    priceInr: item.priceInr,
    unitLabel: item.unitLabel,
    expressMultiplier: 1.5,
    active: true,
  })),
}));

export function listDemoPricing(): DemoPricingGroup[] {
  return readJson<DemoPricingGroup[]>(PRICING_KEY, DEMO_PRICING_SEED);
}

export function saveDemoPricing(groups: DemoPricingGroup[]): void {
  write(PRICING_KEY, groups);
}

export interface DemoSetting {
  key: string;
  value: string | null;
}

/** The eight seeded settings keys (supabase/seed_demo.sql) with the demo values. */
export const DEMO_SETTINGS_SEED: DemoSetting[] = [
  { key: "business_address", value: null },
  { key: "business_email", value: null },
  { key: "business_phone", value: "+91244567889" },
  { key: "business_whatsapp", value: "+91244567889" },
  { key: "first_order_offer_note", value: "20% off your first order with FIRST20." },
  { key: "free_delivery_threshold_paise", value: "29900" },
  { key: "minimum_order_paise", value: "19900" },
  { key: "opening_hours", value: "Mon–Sun, 9 AM – 9 PM" },
];

export function listDemoSettings(): DemoSetting[] {
  return readJson<DemoSetting[]>(SETTINGS_KEY, DEMO_SETTINGS_SEED);
}

export function saveDemoSettings(rows: DemoSetting[]): void {
  write(SETTINGS_KEY, rows);
}
