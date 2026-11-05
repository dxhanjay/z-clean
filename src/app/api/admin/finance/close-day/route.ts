import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { closeDaySchema } from "@/lib/validation";
import { expectedCashPaise, istDayRangeUtc } from "@/lib/finance";

/**
 * POST /api/admin/finance/close-day — the daily cash closing (Phase 9).
 *
 * The expected cash is computed HERE, server-side, from the day's
 * ledger entries (cash payments − cash refunds, Asia/Kolkata day) —
 * the client only reports what was physically counted. The difference
 * is frozen onto the closing row. A date closes exactly once: a second
 * attempt is a 409 ALREADY_CLOSED with the existing record.
 */
export async function POST(request: Request) {
  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json(
      { mode: "demo", message: "Supabase not configured — demo mode." },
      { status: 503 },
    );
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;
  const { supabase, user } = gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = closeDaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const { data: existing } = await supabase
    .from("cash_closings")
    .select("id, closing_date, expected_cash_paise, counted_cash_paise, difference_paise, closed_by_label, created_at")
    .eq("closing_date", input.date)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error: `${input.date} has already been closed.`,
        code: "ALREADY_CLOSED",
        closing: existing,
      },
      { status: 409 },
    );
  }

  const range = istDayRangeUtc(input.date);
  const { data: entryRows } = await supabase
    .from("payment_entries")
    .select("entry_type, method, amount_paise")
    .gte("created_at", range.startUtc)
    .lt("created_at", range.endUtc);
  const entries = (entryRows ?? []).map((e) => ({
    entryType: e.entry_type as "payment" | "refund",
    method: e.method as string,
    amountPaise: e.amount_paise as number,
  }));
  const expected = expectedCashPaise(entries);
  const difference = input.countedCashPaise - expected;

  const { data: closing, error } = await supabase
    .from("cash_closings")
    .insert({
      closing_date: input.date,
      expected_cash_paise: expected,
      counted_cash_paise: input.countedCashPaise,
      difference_paise: difference,
      closed_by_user_id: user.id,
      closed_by_label: user.email ?? null,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .select("id")
    .single();
  if (error || !closing) {
    // A unique-violation here means a concurrent close won the race.
    return NextResponse.json(
      { error: "The day could not be closed. It may already have been closed — reload and check.", code: "CLOSE_FAILED" },
      { status: 409 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "finance.close_day",
    entity: "cash_closings",
    entityId: closing.id,
    details: {
      date: input.date,
      expectedCashPaise: expected,
      countedCashPaise: input.countedCashPaise,
      differencePaise: difference,
    },
  });

  return NextResponse.json({
    mode: "live",
    closingId: closing.id,
    date: input.date,
    expectedCashPaise: expected,
    countedCashPaise: input.countedCashPaise,
    differencePaise: difference,
  });
}
