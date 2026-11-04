/**
 * Reports aggregation (Phase 9, Requirements v2 §2 item 7) — PURE.
 *
 * Every report is computed from real rows the caller fetched (live:
 * Supabase tables via /api/admin/reports; demo: the browser demo
 * stores). This module holds the grouping math only, so the live API
 * and the demo screens can never disagree about how a number is made.
 * Nothing here invents data: empty inputs produce empty reports and
 * the UI shows "No data yet".
 */

import {
  agingBucket,
  AGING_BUCKETS,
  type AgingBucket,
} from "./finance";

export interface ReportOrderItem {
  serviceSlug: string;
  serviceTitle: string;
  lineTotalPaise: number;
}

export interface ReportOrder {
  id: string;
  createdAt: string;
  status: string;
  totalPaise: number;
  /** Effective paid (src/lib/finance.ts) for this order. */
  collectedPaise: number;
  area: string | null;
  /** Stable customer key (profile id live, phone in demo). */
  customerKey: string;
  customerLabel: string;
  items: ReportOrderItem[];
}

export interface ReportHandover {
  orderId: string;
  pointId: string;
  toEmployeeId: string | null;
  flags: string[];
}

export interface ReportEmployee {
  id: string;
  fullName: string;
  branchId: string | null;
}

export interface ReportBranch {
  id: string;
  name: string;
}

export interface ReportVoucher {
  kind: "prepaid_card" | "promo";
  status: string;
  balancePaise: number | null;
}

export interface ReportExpense {
  category: string;
  amountPaise: number;
}

export interface ReportsInput {
  /** Orders created inside the reporting period, cancelled included. */
  periodOrders: ReportOrder[];
  /** Every non-terminal order (aging is a snapshot, not a period). */
  openOrders: ReportOrder[];
  /** Every order ever (retention is all-time by nature). */
  allOrders: ReportOrder[];
  handovers: ReportHandover[];
  employees: ReportEmployee[];
  branches: ReportBranch[];
  vouchers: ReportVoucher[];
  /** Orders carrying a promo voucher discount in the period. */
  voucherDiscountPaise: number;
  /** Gift-card value redeemed against period orders. */
  voucherRedeemedPaise: number;
  expenses: ReportExpense[];
  now: Date;
}

export interface SalesDay {
  date: string;
  orders: number;
  grossPaise: number;
  collectedPaise: number;
}

export interface KeyValueTotal {
  key: string;
  label: string;
  orders: number;
  grossPaise: number;
}

export interface EmployeePerformance {
  employeeId: string;
  name: string;
  handovers: number;
  flagsRaised: number;
  deliveries: number;
}

export interface Reports {
  salesByDay: SalesDay[];
  salesByService: KeyValueTotal[];
  salesByArea: KeyValueTotal[];
  processedByPlant: KeyValueTotal[];
  pendingAging: { bucket: AgingBucket; count: number; orders: { id: string; status: string; ageDays: number; totalPaise: number }[] }[];
  employeePerformance: EmployeePerformance[];
  voucherUsage: {
    created: number;
    issued: number;
    redeemed: number;
    outstandingLiabilityPaise: number;
    discountGivenPaise: number;
    redeemedValuePaise: number;
  };
  retention: {
    customers: number;
    repeatCustomers: number;
    repeatRatePercent: number;
    topCustomers: { label: string; orders: number; grossPaise: number }[];
  };
  expensesByCategory: { category: string; totalPaise: number }[];
  salesVsExpense: {
    grossPaise: number;
    collectedPaise: number;
    expensesPaise: number;
    netPaise: number;
  };
}

const TERMINAL = new Set(["DELIVERED", "CANCELLED"]);

export function buildReports(input: ReportsInput): Reports {
  const salesOrders = input.periodOrders.filter((o) => o.status !== "CANCELLED");

  /* Sales by day (IST calendar dates). */
  const byDay = new Map<string, SalesDay>();
  for (const o of salesOrders) {
    const date = new Date(new Date(o.createdAt).getTime() + 5.5 * 3600_000)
      .toISOString()
      .slice(0, 10);
    let row = byDay.get(date);
    if (!row) {
      row = { date, orders: 0, grossPaise: 0, collectedPaise: 0 };
      byDay.set(date, row);
    }
    row.orders += 1;
    row.grossPaise += o.totalPaise;
    row.collectedPaise += o.collectedPaise;
  }
  const salesByDay = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  /* Sales by service (order-item revenue). */
  const byService = new Map<string, KeyValueTotal & { orderIds: Set<string> }>();
  for (const o of salesOrders) {
    for (const item of o.items) {
      let row = byService.get(item.serviceSlug);
      if (!row) {
        row = {
          key: item.serviceSlug,
          label: item.serviceTitle,
          orders: 0,
          grossPaise: 0,
          orderIds: new Set(),
        };
        byService.set(item.serviceSlug, row);
      }
      row.grossPaise += item.lineTotalPaise;
      row.orderIds.add(o.id);
    }
  }
  const salesByService = [...byService.values()]
    .map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size }))
    .sort((a, b) => b.grossPaise - a.grossPaise);

  /* Sales by area. */
  const byArea = new Map<string, KeyValueTotal>();
  for (const o of salesOrders) {
    const label = o.area?.trim() ? o.area.trim() : "Area not recorded";
    let row = byArea.get(label);
    if (!row) {
      row = { key: label, label, orders: 0, grossPaise: 0 };
      byArea.set(label, row);
    }
    row.orders += 1;
    row.grossPaise += o.totalPaise;
  }
  const salesByArea = [...byArea.values()].sort((a, b) => b.grossPaise - a.grossPaise);

  /* Processed by plant: the branch of the plant_manager who received
   * the order at the centre_to_plant handover. */
  const employeeById = new Map(input.employees.map((e) => [e.id, e]));
  const branchById = new Map(input.branches.map((b) => [b.id, b]));
  const plantReceiverByOrder = new Map<string, string | null>();
  for (const h of input.handovers) {
    if (h.pointId === "centre_to_plant") {
      plantReceiverByOrder.set(h.orderId, h.toEmployeeId);
    }
  }
  const byPlant = new Map<string, KeyValueTotal>();
  for (const o of salesOrders) {
    const receiverId = plantReceiverByOrder.get(o.id);
    const employee = receiverId ? employeeById.get(receiverId) : undefined;
    const branch = employee?.branchId ? branchById.get(employee.branchId) : undefined;
    const label = branch ? branch.name : "Unassigned";
    let row = byPlant.get(label);
    if (!row) {
      row = { key: label, label, orders: 0, grossPaise: 0 };
      byPlant.set(label, row);
    }
    row.orders += 1;
    row.grossPaise += o.totalPaise;
  }
  const processedByPlant = [...byPlant.values()].sort(
    (a, b) => b.grossPaise - a.grossPaise,
  );

  /* Pending-order aging (snapshot of everything still open). */
  const agingMap = new Map<AgingBucket, { id: string; status: string; ageDays: number; totalPaise: number }[]>();
  for (const bucket of AGING_BUCKETS) agingMap.set(bucket, []);
  for (const o of input.openOrders) {
    if (TERMINAL.has(o.status)) continue;
    const bucket = agingBucket(o.createdAt, input.now);
    agingMap.get(bucket)!.push({
      id: o.id,
      status: o.status,
      ageDays: Math.max(
        0,
        Math.floor((input.now.getTime() - new Date(o.createdAt).getTime()) / 86_400_000),
      ),
      totalPaise: o.totalPaise,
    });
  }
  const pendingAging = AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: agingMap.get(bucket)!.length,
    orders: agingMap.get(bucket)!.sort((a, b) => b.ageDays - a.ageDays),
  }));

  /* Employee performance from the handover ledger. */
  const perf = new Map<string, EmployeePerformance>();
  for (const h of input.handovers) {
    if (!h.toEmployeeId) continue;
    let row = perf.get(h.toEmployeeId);
    if (!row) {
      row = {
        employeeId: h.toEmployeeId,
        name: employeeById.get(h.toEmployeeId)?.fullName ?? "Former employee",
        handovers: 0,
        flagsRaised: 0,
        deliveries: 0,
      };
      perf.set(h.toEmployeeId, row);
    }
    row.handovers += 1;
    row.flagsRaised += (h.flags ?? []).length;
    if (h.pointId === "delivery") row.deliveries += 1;
  }
  const employeePerformance = [...perf.values()].sort(
    (a, b) => b.handovers - a.handovers,
  );

  /* Voucher usage. */
  const voucherUsage = {
    created: input.vouchers.length,
    issued: input.vouchers.filter((v) =>
      ["issued", "partially_redeemed", "redeemed"].includes(v.status),
    ).length,
    redeemed: input.vouchers.filter((v) =>
      ["partially_redeemed", "redeemed"].includes(v.status),
    ).length,
    outstandingLiabilityPaise: input.vouchers
      .filter(
        (v) =>
          v.kind === "prepaid_card" &&
          ["created", "issued", "partially_redeemed"].includes(v.status),
      )
      .reduce((sum, v) => sum + (v.balancePaise ?? 0), 0),
    discountGivenPaise: input.voucherDiscountPaise,
    redeemedValuePaise: input.voucherRedeemedPaise,
  };

  /* Retention (all-time). */
  const byCustomer = new Map<string, { label: string; orders: number; grossPaise: number }>();
  for (const o of input.allOrders) {
    if (o.status === "CANCELLED") continue;
    let row = byCustomer.get(o.customerKey);
    if (!row) {
      row = { label: o.customerLabel, orders: 0, grossPaise: 0 };
      byCustomer.set(o.customerKey, row);
    }
    row.orders += 1;
    row.grossPaise += o.totalPaise;
  }
  const customers = byCustomer.size;
  const repeatCustomers = [...byCustomer.values()].filter((c) => c.orders >= 2).length;
  const retention = {
    customers,
    repeatCustomers,
    repeatRatePercent:
      customers === 0 ? 0 : Math.round((repeatCustomers / customers) * 1000) / 10,
    topCustomers: [...byCustomer.values()]
      .sort((a, b) => b.orders - a.orders || b.grossPaise - a.grossPaise)
      .slice(0, 5),
  };

  /* Expenses + sales vs expense. */
  const byCategory = new Map<string, number>();
  let expensesPaise = 0;
  for (const e of input.expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountPaise);
    expensesPaise += e.amountPaise;
  }
  const expensesByCategory = [...byCategory.entries()]
    .map(([category, totalPaise]) => ({ category, totalPaise }))
    .sort((a, b) => b.totalPaise - a.totalPaise);

  const grossPaise = salesOrders.reduce((s, o) => s + o.totalPaise, 0);
  const collectedPaise = salesOrders.reduce((s, o) => s + o.collectedPaise, 0);

  return {
    salesByDay,
    salesByService,
    salesByArea,
    processedByPlant,
    pendingAging,
    employeePerformance,
    voucherUsage,
    retention,
    expensesByCategory,
    salesVsExpense: {
      grossPaise,
      collectedPaise,
      expensesPaise,
      netPaise: collectedPaise - expensesPaise,
    },
  };
}
