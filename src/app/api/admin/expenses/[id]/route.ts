import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/admin/expenses/[id] — remove one expense (Phase 9).
 * The deletion itself is written to the audit log with the full row,
 * so a removed expense is never invisible.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { data: existing, error: loadError } = await supabase
    .from("expenses")
    .select("id, expense_date, category, description, amount_paise, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: "Could not load the expense." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  }

  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "The expense could not be deleted. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "expense.delete",
    entity: "expenses",
    entityId: id,
    details: { deleted: existing },
  });

  return NextResponse.json({ mode: "live", deletedId: id });
}
