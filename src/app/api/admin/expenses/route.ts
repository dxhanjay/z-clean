import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { expenseCreateSchema } from "@/lib/validation";

/**
 * Expenses (Phase 9) — the simple spend ledger behind the
 * sales-vs-expense report.
 *
 * GET lists entries (newest first, optional ?from / ?to date range and
 * ?branchId filter). POST records one expense; every write is
 * audit-logged. Deletion lives in the [id] route and is audit-logged
 * too — an expense can be removed, but never silently.
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
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const branchId = url.searchParams.get("branchId");

  let query = supabase
    .from("expenses")
    .select(
      "id, expense_date, category, description, amount_paise, branch_id, actor_label, created_at, branches ( name )",
    )
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (from) query = query.gte("expense_date", from);
  if (to) query = query.lte("expense_date", to);
  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not load expenses." }, { status: 500 });
  }

  const expenses = (data ?? []).map((row) => {
    const branch = row.branches as unknown as { name: string } | { name: string }[] | null;
    const branchRow = Array.isArray(branch) ? (branch[0] ?? null) : branch;
    return {
      id: row.id,
      expenseDate: row.expense_date,
      category: row.category,
      description: row.description,
      amountPaise: row.amount_paise,
      branchId: row.branch_id,
      branchName: branchRow?.name ?? null,
      actorLabel: row.actor_label,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({
    mode: "live",
    expenses,
    totalPaise: expenses.reduce((s, e) => s + e.amountPaise, 0),
  });
}

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
  const parsed = expenseCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  if (input.branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("id", input.branchId)
      .maybeSingle();
    if (!branch) {
      return NextResponse.json(
        { error: "The selected branch does not exist.", code: "BRANCH_NOT_FOUND" },
        { status: 422 },
      );
    }
  }

  const { data: expense, error } = await supabase
    .from("expenses")
    .insert({
      expense_date: input.expenseDate,
      category: input.category,
      description: input.description?.trim() ? input.description.trim() : null,
      amount_paise: input.amountPaise,
      branch_id: input.branchId ?? null,
      actor_user_id: user.id,
      actor_label: user.email ?? null,
    })
    .select("id")
    .single();
  if (error || !expense) {
    return NextResponse.json(
      { error: "The expense could not be recorded. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "expense.create",
    entity: "expenses",
    entityId: expense.id,
    details: {
      expenseDate: input.expenseDate,
      category: input.category,
      amountPaise: input.amountPaise,
      branchId: input.branchId ?? null,
    },
  });

  return NextResponse.json({ mode: "live", expenseId: expense.id }, { status: 201 });
}
