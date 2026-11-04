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
