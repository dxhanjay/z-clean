import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { voucherActionSchema } from "@/lib/validation";
import { rowToVoucher, VOUCHER_COLUMNS, type VoucherRow } from "@/lib/vouchers-server";

/**
 * GET   /api/admin/vouchers/[id] — voucher + full transaction history.
 * PATCH /api/admin/vouchers/[id] — issue / cancel / expire.
 *
 * Every action writes a voucher_transactions ledger row and an
 * audit_logs row. Cancelling a prepaid card zeroes its balance so a
 * cancelled card can never be spent even if the code leaks. Redeeming
 * happens at checkout or the cashier desk — never here.
 */

type Gate = Awaited<ReturnType<typeof getAdminGate>>;

function gateError(gate: Gate) {
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
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { supabase } = gate;
  const { id } = await params;

  const { data, error } = await supabase
    .from("gift_vouchers")
    .select(VOUCHER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load the voucher." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });

  const { data: txns } = await supabase
    .from("voucher_transactions")
    .select("id, txn_type, amount_paise, balance_after_paise, order_id, actor_label, note, created_at")
    .eq("voucher_id", id)
    .order("created_at", { ascending: false });

  const row = data as VoucherRow;
  let branchName: string | null = null;
  if (row.branch_id) {
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", row.branch_id)
      .maybeSingle();
    branchName = branch?.name ?? null;
  }

  return NextResponse.json({
    mode: "live",
    voucher: { ...rowToVoucher(row), branchName },
    transactions: (txns ?? []).map((t) => ({
      id: t.id,
      voucherId: id,
      orderId: t.order_id,
      txnType: t.txn_type,
      amountPaise: t.amount_paise,
      balanceAfterPaise: t.balance_after_paise,
      actorLabel: t.actor_label,
      note: t.note,
      createdAt: t.created_at,
    })),
  });
}

const TERMINAL: ReadonlySet<string> = new Set(["redeemed", "expired", "cancelled"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { supabase, user } = gate;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = voucherActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;

  // Delta 1 role split: ISSUING a voucher is a desk action (any admin
  // tier); VOIDING one — cancel or expire — destroys value and needs
  // the admin tier or above.
  if (input.action !== "issue") {
    const roleErr = roleGateError(gate, "admin");
    if (roleErr) return roleErr;
  }

  const { data: existing, error: loadError } = await supabase
    .from("gift_vouchers")
    .select(VOUCHER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: "Could not load the voucher." }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
  const voucher = rowToVoucher(existing as VoucherRow);

  if (TERMINAL.has(voucher.status)) {
    return NextResponse.json(
      { error: `This voucher is already ${voucher.status} and cannot change.` },
      { status: 422 },
    );
  }

  let update: Record<string, unknown>;
  let txn: { type: string; amountPaise: number; balanceAfterPaise: number | null; note: string };

  if (input.action === "issue") {
    if (voucher.status !== "created") {
      return NextResponse.json(
        { error: "Only a newly created voucher can be issued." },
        { status: 422 },
      );
    }
    if (!input.issuedToEmployeeId && !input.issuedToName) {
      return NextResponse.json(
        { error: "Tell us who the voucher is issued to (a name, or pick an employee).", fieldErrors: { issuedToName: ["Required — or pick an employee."] } },
        { status: 422 },
      );
    }
    let issuedToName = input.issuedToName ?? null;
    if (input.issuedToEmployeeId) {
      const { data: employee } = await supabase
        .from("employees")
        .select("full_name")
        .eq("id", input.issuedToEmployeeId)
        .maybeSingle();
      if (!employee) {
        return NextResponse.json({ error: "That employee was not found." }, { status: 422 });
      }
      issuedToName = issuedToName ?? employee.full_name;
    }
    update = {
      status: "issued",
      issued_to_name: issuedToName,
      issued_to_phone: input.issuedToPhone ? input.issuedToPhone : null,
      issued_to_employee_id: input.issuedToEmployeeId ?? null,
      issued_by_label: user.email ?? null,
    };
    txn = {
      type: "issue",
      amountPaise: voucher.kind === "prepaid_card" ? (voucher.faceValuePaise ?? 0) : 0,
      balanceAfterPaise: voucher.kind === "prepaid_card" ? voucher.balancePaise : null,
      note: `Issued to ${issuedToName ?? "an employee"}`,
    };
  } else if (input.action === "cancel") {
    update = {
      status: "cancelled",
      ...(voucher.kind === "prepaid_card" ? { balance_paise: 0 } : {}),
    };
    txn = {
      type: "cancel",
      amountPaise: 0,
      balanceAfterPaise: voucher.kind === "prepaid_card" ? 0 : null,
      note:
        voucher.kind === "prepaid_card"
          ? "Cancelled — remaining balance voided"
          : "Cancelled",
    };
  } else {
    update = { status: "expired" };
    txn = {
      type: "expire",
      amountPaise: 0,
      balanceAfterPaise: voucher.balancePaise,
      note: "Marked expired by admin",
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("gift_vouchers")
    .update(update)
    .eq("id", id)
    .select(VOUCHER_COLUMNS)
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ error: "Could not update the voucher." }, { status: 500 });
  }

  const { error: txnError } = await supabase.from("voucher_transactions").insert({
    voucher_id: id,
    order_id: null,
    txn_type: txn.type,
    amount_paise: txn.amountPaise,
    balance_after_paise: txn.balanceAfterPaise,
    actor_user_id: user.id,
    actor_label: user.email ?? null,
    note: txn.note,
  });
  if (txnError) {
    return NextResponse.json(
      { error: "The voucher was updated but its ledger entry failed. Please check the voucher history." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: `voucher.${input.action}`,
    entity: "gift_vouchers",
    entityId: id,
    details: { code: voucher.code, from: voucher.status, to: update.status, note: txn.note },
  });

  return NextResponse.json({
    mode: "live",
    voucher: { ...rowToVoucher(updated as VoucherRow), branchName: null },
  });
}
