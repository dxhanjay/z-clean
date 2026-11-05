/**
 * Demo-mode customer directory (Delta 1) — DERIVED, never stored.
 *
 * Demo mode has no accounts (orders live in this browser's demo
 * store), so the Customer Management screens group demo orders by
 * customer phone — the same identity the demo queue shows. Spend is
 * the finance engine's effective paid via demoOrderFinance, exactly
 * like the dashboard. In live mode this module is unused: the API
 * aggregates real profiles (src/lib/customers-server.ts).
 */

import { listDemoOrders, type DemoOrder } from "./demo-store";
import { demoOrderFinance } from "./demo-finance";

export interface DemoCustomer {
  /** Stable demo key: the customer's phone (or name when phoneless). */
  id: string;
  name: string;
  email: null;
  phone: string;
  role: "customer";
  disabled: false;
  createdAt: string;
  ordersCount: number;
  lifetimeSpendPaise: number;
  outstandingPaise: number;
  lastOrderAt: string | null;
  orders: DemoOrder[];
}

export function groupDemoCustomers(): DemoCustomer[] {
  const byKey = new Map<string, DemoOrder[]>();
  for (const order of listDemoOrders()) {
    const key = order.phone?.trim() || order.name?.trim() || "unknown";
    const list = byKey.get(key) ?? [];
    list.push(order);
    byKey.set(key, list);
  }

  const customers: DemoCustomer[] = [];
  for (const [key, orders] of byKey) {
    const sorted = [...orders].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    let spend = 0;
    let outstanding = 0;
    let count = 0;
    for (const order of orders) {
      if (order.status === "CANCELLED") continue;
      count += 1;
      const finance = demoOrderFinance(order);
      spend += finance.effectivePaidPaise;
      outstanding += finance.outstandingPaise;
    }
    customers.push({
      id: key,
      name: sorted[0]?.name ?? "Customer",
      email: null,
      phone: sorted[0]?.phone ?? "",
      role: "customer",
      disabled: false,
      createdAt: sorted[sorted.length - 1]?.createdAt ?? sorted[0].createdAt,
      ordersCount: count,
      lifetimeSpendPaise: spend,
      outstandingPaise: outstanding,
      lastOrderAt: sorted[0]?.createdAt ?? null,
      orders: sorted,
    });
  }
  return customers.sort((a, b) =>
    (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? ""),
  );
}
