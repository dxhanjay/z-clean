import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { computeOrderFinance, istToday } from "@/lib/finance";
import { buildReports, type ReportOrder } from "@/lib/reports";

/**
 * GET /api/admin/reports?days=7|30|90 — management reports (Phase 9),
 * computed server-side from the real tables by src/lib/reports.ts.
 *
 *   salesByDay / salesByService / salesByArea / processedByPlant —
 *     orders created in the period (cancelled excluded by the math);
 *     "collected" per order is the finance engine's effective paid.
 *   pendingAging — a snapshot of every still-open order, any age.
 *   employeePerformance — the handover ledger: completions, flags,
 *     deliveries per receiving employee.
 *   voucherUsage — voucher stock + liability + period discount/redeemed.
 *   retention — all-time customers, repeat rate, top customers.
 *   expensesByCategory + salesVsExpense — the period's spend vs sales.
 *
 * No placeholders: an empty table yields an empty report section.
 */
export async function GET(request: Request) {
  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
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

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? "30");
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 86_400_000);
  const periodStartIso = periodStart.toISOString();
  const periodStartDate = istToday(periodStart);

  const ORDER_COLS =
    "id, user_id, status, payment_status, total_paise, created_at, voucher_discount_paise, voucher_redeemed_paise, profiles ( name, phone ), addresses ( area )";

  const [{ data: periodRows }, { data: allRows }, { data: openRows }] =
    await Promise.all([
      supabase.from("orders").select(ORDER_COLS).gte("created_at", periodStartIso).order("created_at", { ascending: true }).limit(5000),
      supabase.from("orders").select(ORDER_COLS).order("created_at", { ascending: true }).limit(5000),
      supabase.from("orders").select(ORDER_COLS).not("status", "in", "(DELIVERED,CANCELLED)").order("created_at", { ascending: true }).limit(5000),
    ]);

  type OrderRow = {
    id: string;
    user_id: string;
    status: string;
    payment_status: string;
    total_paise: number;
    created_at: string;
    voucher_discount_paise: number | null;
    voucher_redeemed_paise: number | null;
    profiles: unknown;
    addresses: unknown;
  };
  const periodOrdersRaw = (periodRows ?? []) as unknown as OrderRow[];
  const allOrdersRaw = (allRows ?? []) as unknown as OrderRow[];
  const openOrdersRaw = (openRows ?? []) as unknown as OrderRow[];
  const periodIds = periodOrdersRaw.map((o) => o.id);

  const pick = <T,>(v: T | T[] | null): T | null =>
    v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;

  /* Items for period orders (service revenue). */
  const itemsByOrder = new Map<string, ReportOrder["items"]>();
  if (periodIds.length) {
    const { data: itemRows } = await supabase
      .from("order_items")
      .select("order_id, line_total_paise, price_items ( item_name, services ( slug, name ) )")
      .in("order_id", periodIds)
      .limit(20000);
    for (const row of itemRows ?? []) {
      const pi = pick(row.price_items as unknown as { item_name: string; services: { slug: string; name: string } | { slug: string; name: string }[] | null } | null);
      const svc = pi ? pick(pi.services) : null;
      const list = itemsByOrder.get(row.order_id as string) ?? [];
      list.push({
        serviceSlug: svc?.slug ?? "unknown",
        serviceTitle: svc?.name ?? pi?.item_name ?? "Service",
        lineTotalPaise: row.line_total_paise as number,
      });
      itemsByOrder.set(row.order_id as string, list);
    }
  }

  /* Collected per period order, via the finance engine. */
  const collectedByOrder = new Map<string, number>();
  if (periodIds.length) {
    const [{ data: payRows }, { data: entryRows }, { data: refundRows }] =
      await Promise.all([
        supabase.from("payments").select("order_id, amount_paise, status").in("order_id", periodIds),
        supabase.from("payment_entries").select("order_id, entry_type, method, amount_paise").in("order_id", periodIds),
        supabase.from("refunds").select("order_id, amount_paise, status").in("order_id", periodIds),
      ]);
    const group = <T extends { order_id: string }>(rows: T[] | null) => {
      const map = new Map<string, T[]>();
      for (const r of rows ?? []) {
        const list = map.get(r.order_id) ?? [];
        list.push(r);
        map.set(r.order_id, list);
      }
      return map;
    };
    const payBy = group(payRows as { order_id: string; amount_paise: number; status: string }[] | null);
    const entryBy = group(entryRows as { order_id: string; entry_type: "payment" | "refund"; method: string; amount_paise: number }[] | null);
    const refundBy = group(refundRows as { order_id: string; amount_paise: number; status: string }[] | null);
    for (const o of periodOrdersRaw) {
      const finance = computeOrderFinance(
        { totalPaise: o.total_paise, paymentStatus: o.payment_status },
        (payBy.get(o.id) ?? []).map((r) => ({ amountPaise: r.amount_paise, status: r.status })),
        (entryBy.get(o.id) ?? []).map((r) => ({ entryType: r.entry_type, method: r.method, amountPaise: r.amount_paise })),
        (refundBy.get(o.id) ?? []).map((r) => ({ amountPaise: r.amount_paise, status: r.status })),
      );
      collectedByOrder.set(o.id, finance.effectivePaidPaise);
    }
  }

  const toReportOrder = (o: OrderRow, withItems: boolean): ReportOrder => {
    const profile = pick(o.profiles as { name: string | null; phone: string | null } | null);
    const address = pick(o.addresses as { area: string | null } | null);
    return {
      id: o.id,
      createdAt: o.created_at,
      status: o.status,
      totalPaise: o.total_paise,
      collectedPaise: collectedByOrder.get(o.id) ?? 0,
      area: address?.area ?? null,
      customerKey: o.user_id,
      customerLabel: profile?.name ?? profile?.phone ?? "Customer",
      items: withItems ? (itemsByOrder.get(o.id) ?? []) : [],
    };
  };

  /* Handovers: period activity for performance + plant receivers for
   * the period's orders. */
  const { data: periodHandovers } = await supabase
    .from("handovers")
    .select("id, order_id, point_id, to_employee_id, flags")
    .gte("created_at", periodStartIso)
    .limit(20000);
  const handoverById = new Map<string, { orderId: string; pointId: string; toEmployeeId: string | null; flags: string[] }>();
  for (const h of periodHandovers ?? []) {
    handoverById.set(h.id as string, {
      orderId: h.order_id as string,
      pointId: h.point_id as string,
      toEmployeeId: (h.to_employee_id as string | null) ?? null,
      flags: (h.flags as string[] | null) ?? [],
    });
  }
  if (periodIds.length) {
    const { data: plantHandovers } = await supabase
      .from("handovers")
      .select("id, order_id, point_id, to_employee_id, flags")
      .eq("point_id", "centre_to_plant")
      .in("order_id", periodIds)
      .limit(5000);
    for (const h of plantHandovers ?? []) {
      if (!handoverById.has(h.id as string)) {
        handoverById.set(h.id as string, {
          orderId: h.order_id as string,
          pointId: h.point_id as string,
          toEmployeeId: (h.to_employee_id as string | null) ?? null,
          flags: (h.flags as string[] | null) ?? [],
        });
      }
    }
  }

  const [{ data: employeeRows }, { data: branchRows }, { data: voucherRows }, { data: expenseRows }] =
    await Promise.all([
      supabase.from("employees").select("id, full_name, branch_id"),
      supabase.from("branches").select("id, name"),
      supabase.from("gift_vouchers").select("kind, status, balance_paise").limit(5000),
      supabase.from("expenses").select("category, amount_paise").gte("expense_date", periodStartDate).limit(5000),
    ]);

  const reports = buildReports({
    periodOrders: periodOrdersRaw.map((o) => toReportOrder(o, true)),
    openOrders: openOrdersRaw.map((o) => toReportOrder(o, false)),
    allOrders: allOrdersRaw.map((o) => toReportOrder(o, false)),
    handovers: [...handoverById.values()],
    employees: (employeeRows ?? []).map((e) => ({
      id: e.id as string,
      fullName: e.full_name as string,
      branchId: (e.branch_id as string | null) ?? null,
    })),
    branches: (branchRows ?? []).map((b) => ({ id: b.id as string, name: b.name as string })),
    vouchers: (voucherRows ?? []).map((v) => ({
      kind: v.kind as "prepaid_card" | "promo",
      status: v.status as string,
      balancePaise: (v.balance_paise as number | null) ?? null,
    })),
    voucherDiscountPaise: periodOrdersRaw.reduce(
      (s, o) => s + (o.status !== "CANCELLED" ? (o.voucher_discount_paise ?? 0) : 0),
      0,
    ),
    voucherRedeemedPaise: periodOrdersRaw.reduce(
      (s, o) => s + (o.status !== "CANCELLED" ? (o.voucher_redeemed_paise ?? 0) : 0),
      0,
    ),
    expenses: (expenseRows ?? []).map((e) => ({
      category: e.category as string,
      amountPaise: e.amount_paise as number,
    })),
    now,
  });

  return NextResponse.json({
    mode: "live",
    days,
    periodStart: periodStartIso,
    generatedAt: now.toISOString(),
    reports,
  });
}
