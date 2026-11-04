import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import {
  collectionsByMethod,
  expectedCashPaise,
  istDayRangeUtc,
  istToday,
} from "@/lib/finance";

/**
 * GET /api/admin/finance/overview?date=YYYY-MM-DD — one day's money
 * (Phase 9), with the day bounded in Asia/Kolkata (UTC+05:30):
 *
 *   - collections grouped by method, split by source: gateway-table
 *     rows created that day (Razorpay + gift cards — online money) and
 *     staff-ledger entries (cash / UPI / card machine / bank transfer);
 *   - refunds processed that day (ledger 'refund' entries);
 *   - the day's expenses total (expenses.expense_date = the date);
 *   - expected cash = cash payments − cash refunds, LEDGER ENTRIES
 *     ONLY — gateway money is never physical cash;
 *   - the closing record for the date, when the day has been closed.
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
  const dateParam = url.searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : istToday();
  const range = istDayRangeUtc(date);

  const [{ data: gatewayRows }, { data: entryRows }, { data: expenseRows }, { data: closing }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("gateway, amount_paise, status")
        .eq("status", "paid")
        .gte("created_at", range.startUtc)
        .lt("created_at", range.endUtc),
      supabase
        .from("payment_entries")
        .select("entry_type, method, amount_paise")
        .gte("created_at", range.startUtc)
        .lt("created_at", range.endUtc),
      supabase
        .from("expenses")
        .select("amount_paise")
        .eq("expense_date", date),
      supabase
        .from("cash_closings")
        .select(
          "id, closing_date, expected_cash_paise, counted_cash_paise, difference_paise, closed_by_label, note, created_at",
        )
        .eq("closing_date", date)
        .maybeSingle(),
    ]);

  const gatewayPayments = (gatewayRows ?? []).map((p) => ({
    gateway: p.gateway as string,
    amountPaise: p.amount_paise as number,
    status: p.status as string,
  }));
  const entries = (entryRows ?? []).map((e) => ({
    entryType: e.entry_type as "payment" | "refund",
    method: e.method as string,
    amountPaise: e.amount_paise as number,
  }));

  const collections = collectionsByMethod(gatewayPayments, entries);
  const refundsProcessed = entries.filter((e) => e.entryType === "refund");
  const refundsProcessedPaise = refundsProcessed.reduce((s, e) => s + e.amountPaise, 0);
  const expensesTotalPaise = (expenseRows ?? []).reduce(
    (s, e) => s + (e.amount_paise as number),
    0,
  );
  const totalCollectedPaise = collections.reduce((s, c) => s + c.totalPaise, 0);

  return NextResponse.json({
    mode: "live",
    date,
    collections,
    totalCollectedPaise,
    refundsProcessedPaise,
    refundsProcessedCount: refundsProcessed.length,
    expensesTotalPaise,
    netCollectedPaise: totalCollectedPaise - refundsProcessedPaise,
    expectedCashPaise: expectedCashPaise(entries),
    closing: closing
      ? {
          id: closing.id,
          date: closing.closing_date,
          expectedCashPaise: closing.expected_cash_paise,
          countedCashPaise: closing.counted_cash_paise,
          differencePaise: closing.difference_paise,
          closedByLabel: closing.closed_by_label,
          note: closing.note,
          createdAt: closing.created_at,
        }
      : null,
  });
}
