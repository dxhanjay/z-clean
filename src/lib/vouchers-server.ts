import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normaliseVoucherCode,
  prepaidStatusAfter,
  promoStatusAfter,
  type GiftVoucher,
} from "@/lib/vouchers";

/**
 * Voucher persistence (Phase 7b) — SERVER ONLY.
 *
 * Voucher codes are bearer instruments: gift_vouchers is admin-only
 * under RLS, so every read/write here runs through the service-role
 * admin client, and only AFTER the caller has authenticated the actor
 * (the signed-in customer at checkout, or the admin gate at the cashier
 * desk). Never call these helpers with a customer/anon client, and never
 * return a voucher row to the browser — responses carry effects only.
 */

export interface VoucherRow {
  id: string;
  code: string;
  kind: "prepaid_card" | "promo";
  face_value_paise: number | null;
  balance_paise: number | null;
  discount_type: "fixed" | "percent" | null;
  discount_value: number | null;
  max_discount_paise: number | null;
  min_order_paise: number;
  eligible_services: string[];
  branch_id: string | null;
  usage_limit: number;
  times_used: number;
  status: GiftVoucher["status"];
  issued_to_name: string | null;
  issued_to_phone: string | null;
  issued_to_employee_id: string | null;
  issued_by_label: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

export const VOUCHER_COLUMNS =
  "id, code, kind, face_value_paise, balance_paise, discount_type, discount_value, max_discount_paise, min_order_paise, eligible_services, branch_id, usage_limit, times_used, status, issued_to_name, issued_to_phone, issued_to_employee_id, issued_by_label, valid_from, valid_until, created_at";

export function rowToVoucher(row: VoucherRow): GiftVoucher {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    faceValuePaise: row.face_value_paise,
    balancePaise: row.balance_paise,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    maxDiscountPaise: row.max_discount_paise,
    minOrderPaise: row.min_order_paise,
    eligibleServices: row.eligible_services ?? [],
    branchId: row.branch_id,
    usageLimit: row.usage_limit,
    timesUsed: row.times_used,
    status: row.status,
    issuedToName: row.issued_to_name,
    issuedToPhone: row.issued_to_phone,
    issuedToEmployeeId: row.issued_to_employee_id,
    issuedByLabel: row.issued_by_label,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
  };
}

export async function loadVoucherByCode(
  adminClient: SupabaseClient,
  code: string,
): Promise<GiftVoucher | null> {
  const { data, error } = await adminClient
    .from("gift_vouchers")
    .select(VOUCHER_COLUMNS)
    .eq("code", normaliseVoucherCode(code))
    .maybeSingle();
  if (error || !data) return null;
  return rowToVoucher(data as VoucherRow);
}

export interface VoucherActor {
  userId: string | null;
  label: string | null;
}

async function insertTxn(
  adminClient: SupabaseClient,
  args: {
    voucherId: string;
    orderId: string | null;
    amountPaise: number;
    balanceAfterPaise: number | null;
    actor: VoucherActor;
    note?: string;
  },
): Promise<void> {
  const { error } = await adminClient.from("voucher_transactions").insert({
    voucher_id: args.voucherId,
    order_id: args.orderId,
    txn_type: "redeem",
    amount_paise: args.amountPaise,
    balance_after_paise: args.balanceAfterPaise,
    actor_user_id: args.actor.userId,
    actor_label: args.actor.label,
    note: args.note ?? null,
  });
  if (error) throw new Error(`voucher transaction insert failed: ${error.message}`);
}

/**
 * Apply a promo redemption: consume one use, flip to 'redeemed' when the
 * usage limit is reached, and ledger the discount. Throws on DB error —
 * the caller decides how to surface it.
 */
export async function applyPromoRedemption(
  adminClient: SupabaseClient,
  voucher: GiftVoucher,
  discountPaise: number,
  orderId: string,
  actor: VoucherActor,
): Promise<void> {
  const { error } = await adminClient
    .from("gift_vouchers")
    .update({ times_used: voucher.timesUsed + 1, status: promoStatusAfter(voucher) })
    .eq("id", voucher.id);
  if (error) throw new Error(`voucher update failed: ${error.message}`);
  await insertTxn(adminClient, {
    voucherId: voucher.id,
    orderId,
    amountPaise: discountPaise,
    balanceAfterPaise: null,
    actor,
    note: "Promo discount applied at checkout",
  });
}

/**
 * Apply a prepaid redemption: reduce the balance, record the PAYMENT
 * (payments row, gateway 'voucher', status 'paid' — payments are
 * admin-write under RLS, hence the service-role client) and ledger the
 * redemption. Throws on DB error.
 */
export async function applyPrepaidRedemption(
  adminClient: SupabaseClient,
  voucher: GiftVoucher,
  redeemPaise: number,
  orderId: string,
  actor: VoucherActor,
  note: string,
): Promise<{ balanceAfterPaise: number }> {
  const { balancePaise, status } = prepaidStatusAfter(voucher, redeemPaise);
  const { error } = await adminClient
    .from("gift_vouchers")
    .update({ balance_paise: balancePaise, status })
    .eq("id", voucher.id);
  if (error) throw new Error(`voucher update failed: ${error.message}`);

  const { error: payError } = await adminClient.from("payments").insert({
    order_id: orderId,
    gateway: "voucher",
    gateway_order_id: null,
    gateway_payment_id: null,
    amount_paise: redeemPaise,
    status: "paid",
  });
  if (payError) throw new Error(`voucher payment insert failed: ${payError.message}`);

  await insertTxn(adminClient, {
    voucherId: voucher.id,
    orderId,
    amountPaise: redeemPaise,
    balanceAfterPaise: balancePaise,
    actor,
    note,
  });
  return { balanceAfterPaise: balancePaise };
}
