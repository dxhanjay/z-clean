/**
 * Customer aggregation (Delta 1) — SERVER ONLY helpers shared by the
 * admin customers API.
 *
 * Lifetime spend is LEDGER-CONSISTENT by construction: it is the sum
 * of src/lib/finance.ts `computeOrderFinance(...).effectivePaidPaise`
 * over the customer's orders — the same "effective paid" every
 * finance screen uses (gateway 'paid' rows + staff-ledger 'payment'
 * entries, with the legacy settled rule), never a sum of order
 * totals (which would count money never collected). Cancelled
 * orders are excluded from the count and the spend: a cancelled
 * order is not business done.
 */

import { computeOrderFinance } from "./finance";

export interface CustomerOrderRow {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  total_paise: number;
  created_at: string;
}

export interface CustomerSummary {
  ordersCount: number;
  lifetimeSpendPaise: number;
  outstandingPaise: number;
  lastOrderAt: string | null;
}

export function summarizeCustomerOrders(
  orders: CustomerOrderRow[],
  gatewayPayments: { order_id: string; amount_paise: number; status: string }[],
  entries: {
    order_id: string;
    entry_type: "payment" | "refund";
    method: string;
    amount_paise: number;
  }[],
): CustomerSummary {
  const payByOrder = new Map<string, typeof gatewayPayments>();
  for (const p of gatewayPayments) {
    const list = payByOrder.get(p.order_id) ?? [];
    list.push(p);
    payByOrder.set(p.order_id, list);
  }
  const entriesByOrder = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = entriesByOrder.get(e.order_id) ?? [];
    list.push(e);
    entriesByOrder.set(e.order_id, list);
  }

  let ordersCount = 0;
  let lifetimeSpendPaise = 0;
  let outstandingPaise = 0;
  let lastOrderAt: string | null = null;

  for (const order of orders) {
    if (!lastOrderAt || order.created_at > lastOrderAt) {
      lastOrderAt = order.created_at;
    }
    if (order.status === "CANCELLED") continue;
    ordersCount += 1;
    const finance = computeOrderFinance(
      { totalPaise: order.total_paise, paymentStatus: order.payment_status },
      (payByOrder.get(order.id) ?? []).map((p) => ({
        amountPaise: p.amount_paise,
        status: p.status,
      })),
      (entriesByOrder.get(order.id) ?? []).map((e) => ({
        entryType: e.entry_type,
        method: e.method,
        amountPaise: e.amount_paise,
      })),
      [],
    );
    lifetimeSpendPaise += finance.effectivePaidPaise;
    outstandingPaise += finance.outstandingPaise;
  }

  return { ordersCount, lifetimeSpendPaise, outstandingPaise, lastOrderAt };
}
