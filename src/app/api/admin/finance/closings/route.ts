import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";

/**
 * GET /api/admin/finance/closings — past daily cash closings, newest
 * first (Phase 9). Companion to the per-date overview.
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

  const { data, error } = await gate.supabase
    .from("cash_closings")
    .select(
      "id, closing_date, expected_cash_paise, counted_cash_paise, difference_paise, closed_by_label, note, created_at",
    )
    .order("closing_date", { ascending: false })
    .limit(90);
  if (error) {
    return NextResponse.json({ error: "Could not load closings." }, { status: 500 });
  }

  return NextResponse.json({
    mode: "live",
    closings: (data ?? []).map((c) => ({
      id: c.id,
      date: c.closing_date,
      expectedCashPaise: c.expected_cash_paise,
      countedCashPaise: c.counted_cash_paise,
      differencePaise: c.difference_paise,
      closedByLabel: c.closed_by_label,
      note: c.note,
      createdAt: c.created_at,
    })),
  });
}
