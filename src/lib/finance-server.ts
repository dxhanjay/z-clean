import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeOrderFinance,
  decidePaymentStatus,
  type OrderFinance,
} from "@/lib/finance";

/**
 * Finance persistence (Phase 9) — SERVER ONLY.
 *
 * Loads everything src/lib/finance.ts needs for one order (gateway
 * payments, ledger entries, refund requests) and computes the summary;
 * `syncOrderPaymentStatus` then writes the derived payment_status back
 * when a money event moved it ('paid' / 'partially_paid' / 'refunded').
 *
 * All reads/writes run on the caller's admin-gated Supabase client —
 * the finance tables are admin-only under RLS, which matches.
 */

export interface LoadedOrderFinance {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    totalPaise: number;
  };
  finance: OrderFinance;
  gatewayPayments: {
    id: string;
    gateway: string;
    amountPaise: number;
    status: string;
    gatewayPaymentId: string | null;
    createdAt: string;
  }[];
  entries: {
    id: string;
    entryType: "payment" | "refund";
    method: string;
    amountPaise: number;
    reference: string | null;
    note: string | null;
    recordedByEmployeeId: string | null;
    actorLabel: string | null;
    createdAt: string;
  }[];
  refunds: {
    id: string;
    amountPaise: number;
    reason: string;
    method: string;
    status: string;
    requestedByLabel: string | null;
    decidedByLabel: string | null;
    decidedAt: string | null;
    processedAt: string | null;
    createdAt: string;
  }[];
}

export async function loadOrderFinance(
  supabase: SupabaseClient,
  orderId: string,
): Promise<LoadedOrderFinance | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, payment_status, payment_method, total_paise")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return null;

  const [{ data: payments }, { data: entryRows }, { data: refundRows }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("id, gateway, amount_paise, status, gateway_payment_id, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("payment_entries")
        .select(
          "id, entry_type, method, amount_paise, reference, note, recorded_by_employee_id, actor_label, created_at",
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase
        .from("refunds")
        .select(
          "id, amount_paise, reason, method, status, requested_by_label, decided_by_label, decided_at, processed_at, created_at",
        )
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
    ]);

  const gatewayPayments = (payments ?? []).map((p) => ({
    id: p.id as string,
    gateway: p.gateway as string,
    amountPaise: p.amount_paise as number,
    status: p.status as string,
    gatewayPaymentId: (p.gateway_payment_id as string | null) ?? null,
    createdAt: p.created_at as string,
  }));
  const entries = (entryRows ?? []).map((e) => ({
    id: e.id as string,
    entryType: e.entry_type as "payment" | "refund",
    method: e.method as string,
    amountPaise: e.amount_paise as number,
    reference: (e.reference as string | null) ?? null,
    note: (e.note as string | null) ?? null,
    recordedByEmployeeId: (e.recorded_by_employee_id as string | null) ?? null,
    actorLabel: (e.actor_label as string | null) ?? null,
    createdAt: e.created_at as string,
  }));
  const refunds = (refundRows ?? []).map((r) => ({
    id: r.id as string,
    amountPaise: r.amount_paise as number,
    reason: r.reason as string,
    method: r.method as string,
    status: r.status as string,
    requestedByLabel: (r.requested_by_label as string | null) ?? null,
    decidedByLabel: (r.decided_by_label as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
    processedAt: (r.processed_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  const finance = computeOrderFinance(
    { totalPaise: order.total_paise, paymentStatus: order.payment_status },
    gatewayPayments,
    entries,
    refunds,
  );

  return {
    order: {
      id: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      totalPaise: order.total_paise,
    },
    finance,
    gatewayPayments,
    entries,
    refunds,
  };
}

/**
 * Recompute the order's finance and persist payment_status when the
 * derived value differs. Returns the fresh summary (with the new
 * status applied to the finance input before deciding — callers pass
 * the JUST-loaded state; after a status change to 'paid' the legacy
 * rule must not retro-fire, so the decision is made from the pre-sync
 * snapshot exactly as loaded).
 */
export async function syncOrderPaymentStatus(
  supabase: SupabaseClient,
  loaded: LoadedOrderFinance,
): Promise<{ paymentStatus: string; changed: boolean }> {
  const next = decidePaymentStatus(loaded.finance);
  if (!next || next === loaded.order.paymentStatus) {
    return { paymentStatus: loaded.order.paymentStatus, changed: false };
  }
  const { error } = await supabase
    .from("orders")
    .update({ payment_status: next, updated_at: new Date().toISOString() })
    .eq("id", loaded.order.id);
  if (error) {
    console.error(
      `[finance] could not sync payment_status for order ${loaded.order.id}: ${error.message}`,
    );
    return { paymentStatus: loaded.order.paymentStatus, changed: false };
  }
  return { paymentStatus: next, changed: true };
}

/** Append a customer-visible timeline note (order_status_history). */
export async function addOrderTimelineNote(
  supabase: SupabaseClient,
  orderId: string,
  status: string,
  note: string,
  actorId: string,
): Promise<void> {
  const { error } = await supabase.from("order_status_history").insert({
    order_id: orderId,
    status,
    note,
    actor_id: actorId,
  });
  if (error) {
    console.error(
      `[finance] could not write timeline note for order ${orderId}: ${error.message}`,
    );
  }
}
