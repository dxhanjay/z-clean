import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { ageInDays, computeOrderFinance } from "@/lib/finance";

/**
 * GET /api/admin/finance/outstanding — every non-cancelled order that
 * still owes money (Phase 9), oldest first. Amounts come from the one
 * finance computation (src/lib/finance.ts): gateway rows + ledger
 * entries + the legacy-settled rule, so this list always agrees with
 * the order page and the receipt.
 */
export async function GET() {
  const gate = await getAdminGate();
  if (gate.kind === "demo") {
    return NextResponse.json({ mode: "demo" }, { status: 503 });
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { supabase } = gate;

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, total_paise, created_at, profiles ( name, phone ), addresses ( area, city )",
    )
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error || !orders) {
    return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  }

  const ids = orders.map((o) => o.id);
  const [{ data: payments }, { data: entries }, { data: refunds }] = ids.length
    ? await Promise.all([
        supabase.from("payments").select("order_id, amount_paise, status").in("order_id", ids),
        supabase.from("payment_entries").select("order_id, entry_type, method, amount_paise").in("order_id", ids),
        supabase.from("refunds").select("order_id, amount_paise, status").in("order_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const group = <T extends { order_id: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const list = map.get(r.order_id) ?? [];
      list.push(r);
      map.set(r.order_id, list);
    }
    return map;
  };
  const paymentsByOrder = group(payments as { order_id: string; amount_paise: number; status: string }[] | null);
  const entriesByOrder = group(entries as { order_id: string; entry_type: "payment" | "refund"; method: string; amount_paise: number }[] | null);
  const refundsByOrder = group(refunds as { order_id: string; amount_paise: number; status: string }[] | null);

  const now = new Date();
  const outstanding = orders
    .map((o) => {
      const profile = o.profiles as unknown as { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
      const address = o.addresses as unknown as { area: string | null; city: string | null } | { area: string | null; city: string | null }[] | null;
      const p = Array.isArray(profile) ? (profile[0] ?? null) : profile;
      const a = Array.isArray(address) ? (address[0] ?? null) : address;
      const finance = computeOrderFinance(
        { totalPaise: o.total_paise, paymentStatus: o.payment_status },
        (paymentsByOrder.get(o.id) ?? []).map((r) => ({ amountPaise: r.amount_paise, status: r.status })),
        (entriesByOrder.get(o.id) ?? []).map((r) => ({ entryType: r.entry_type, method: r.method, amountPaise: r.amount_paise })),
        (refundsByOrder.get(o.id) ?? []).map((r) => ({ amountPaise: r.amount_paise, status: r.status })),
      );
      return {
        orderId: o.id,
        status: o.status,
        paymentStatus: o.payment_status,
        customer: p?.name ?? "Customer",
        phone: p?.phone ?? null,
        area: a?.area ?? null,
        city: a?.city ?? null,
        totalPaise: o.total_paise,
        paidPaise: finance.effectivePaidPaise,
        outstandingPaise: finance.outstandingPaise,
        createdAt: o.created_at,
        ageDays: ageInDays(o.created_at, now),
      };
    })
    .filter((o) => o.outstandingPaise > 0);

  return NextResponse.json({
    mode: "live",
    orders: outstanding,
    count: outstanding.length,
    totalOutstandingPaise: outstanding.reduce((s, o) => s + o.outstandingPaise, 0),
  });
}
