import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { voucherCreateSchema } from "@/lib/validation";
import { generateVoucherCode } from "@/lib/vouchers";
import { rowToVoucher, VOUCHER_COLUMNS, type VoucherRow } from "@/lib/vouchers-server";

/**
 * GET / POST /api/admin/vouchers — Gift Voucher Management (Phase 7b,
 * Requirements v2 §3).
 *
 * A create call mints a campaign batch (1–50 codes sharing identical
 * terms, each with its own unique code) in status 'created'. Issuing,
 * cancelling and expiring happen per voucher via PATCH on [id]; every
 * step writes a voucher_transactions ledger row and an audit_logs row.
 *
 * Live mode only for a signed-in admin (gift_vouchers RLS is admin-only
 * too). Without Supabase: 503 { mode: "demo" } and the UI runs on the
 * browser demo store.
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

export async function GET() {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { supabase } = gate;

  const [{ data, error }, { data: branchRows }] = await Promise.all([
    supabase
      .from("gift_vouchers")
      .select(VOUCHER_COLUMNS)
      .order("created_at", { ascending: false }),
    supabase.from("branches").select("id, name"),
  ]);
  if (error) {
    return NextResponse.json({ error: "Could not load vouchers." }, { status: 500 });
  }
  const branchName = new Map((branchRows ?? []).map((b) => [b.id, b.name]));
  const vouchers = ((data ?? []) as VoucherRow[]).map((row) => ({
    ...rowToVoucher(row),
    branchName: row.branch_id ? (branchName.get(row.branch_id) ?? null) : null,
  }));
  return NextResponse.json({ mode: "live", vouchers });
}

export async function POST(request: Request) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;
  const { supabase, user } = gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = voucherCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }
  const input = parsed.data;
  const quantity = input.quantity ?? 1;

  // Mint unique codes: check the batch against itself and the table.
  const codes = new Set<string>();
  while (codes.size < quantity) codes.add(generateVoucherCode());
  const { data: clashes } = await supabase
    .from("gift_vouchers")
    .select("code")
    .in("code", [...codes]);
  for (const row of clashes ?? []) codes.delete(row.code);
  while (codes.size < quantity) codes.add(generateVoucherCode());

  const isPrepaid = input.kind === "prepaid_card";
  const rows = [...codes].map((code) => ({
    code,
    kind: input.kind,
    face_value_paise: isPrepaid ? (input.faceValuePaise ?? null) : null,
    balance_paise: isPrepaid ? (input.faceValuePaise ?? null) : null,
    discount_type: isPrepaid ? null : (input.discountType ?? null),
    discount_value: isPrepaid ? null : (input.discountValue ?? null),
    max_discount_paise: isPrepaid ? null : (input.maxDiscountPaise ?? null),
    min_order_paise: input.minOrderPaise ?? 0,
    eligible_services: input.eligibleServices ?? [],
    branch_id: input.branchId ?? null,
    usage_limit: input.usageLimit ?? 1,
    status: "created",
    valid_from: input.validFrom ?? null,
    valid_until: input.validUntil ?? null,
  }));

  const { data, error } = await supabase
    .from("gift_vouchers")
    .insert(rows)
    .select(VOUCHER_COLUMNS);
  if (error || !data) {
    return NextResponse.json(
      { error: "Could not create the vouchers. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "voucher.create",
    entity: "gift_vouchers",
    entityId: null,
    details: {
      quantity,
      codes: [...codes],
      kind: input.kind,
      faceValuePaise: isPrepaid ? (input.faceValuePaise ?? null) : null,
      discountType: isPrepaid ? null : (input.discountType ?? null),
      discountValue: isPrepaid ? null : (input.discountValue ?? null),
      minOrderPaise: input.minOrderPaise ?? 0,
      branchId: input.branchId ?? null,
    },
  });

  const vouchers = (data as VoucherRow[]).map((row) => ({
    ...rowToVoucher(row),
    branchName: null,
  }));
  return NextResponse.json({ mode: "live", vouchers }, { status: 201 });
}
