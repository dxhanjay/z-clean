import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { customerDisabledSchema } from "@/lib/validation";
import {
  summarizeCustomerOrders,
  type CustomerOrderRow,
} from "@/lib/customers-server";

/**
 * GET   /api/admin/customers/[id] — one customer (Delta 1): profile,
 *       addresses, the last 20 orders, active vouchers and money
 *       totals. Any admin tier. Reads run through the service-role
 *       client for the same reason as the list (the email lives in
 *       Supabase Auth); the caller is gated first.
 * PATCH /api/admin/customers/[id] { disabled } — disable / enable
 *       the account (ADMIN tier and up). A disabled customer can
 *       still sign in and see their history, but POST /api/orders
 *       and POST /api/pickups answer 403 ACCOUNT_DISABLED. The write
 *       goes through the caller's own RLS client (the profiles
 *       "update own or admin" policy), and every flip is audit-logged
 *       as customer.disable / customer.enable.
 *
 * "Active vouchers" links by issued_to_phone = the customer's phone:
 * gift_vouchers has no customer foreign key (vouchers are issued to
 * a name/phone at the desk), so the phone is the strongest link the
 * data model offers.
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
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { id } = await params;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, name, phone, role, disabled, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Could not load the customer." }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const email = authUser?.user?.email ?? null;

  const [{ data: addressRows }, { data: orderRows }, { data: voucherRows }] =
    await Promise.all([
      admin
        .from("addresses")
        .select("id, label, line, area, city, pincode, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      admin
        .from("orders")
        .select("id, user_id, status, payment_status, total_paise, created_at, delivery_type")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(500),
      profile.phone
        ? admin
            .from("gift_vouchers")
            .select(
              "id, code, kind, status, balance_paise, face_value_paise, discount_type, discount_value, valid_until",
            )
            .eq("issued_to_phone", profile.phone)
            .in("status", ["issued", "partially_redeemed"])
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
    ]);

  const orders = (orderRows ?? []) as (CustomerOrderRow & {
    delivery_type: string;
  })[];
  const orderIds = orders.map((o) => o.id);
  const [{ data: payRows }, { data: entryRows }, { data: itemRows }] =
    orderIds.length > 0
      ? await Promise.all([
          admin
            .from("payments")
            .select("order_id, amount_paise, status")
            .in("order_id", orderIds),
          admin
            .from("payment_entries")
            .select("order_id, entry_type, method, amount_paise")
            .in("order_id", orderIds),
          admin.from("order_items").select("order_id, qty").in("order_id", orderIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const itemCountByOrder = new Map<string, number>();
  for (const row of (itemRows ?? []) as { order_id: string; qty: number }[]) {
    itemCountByOrder.set(
      row.order_id,
      (itemCountByOrder.get(row.order_id) ?? 0) + Number(row.qty),
    );
  }

  const summary = summarizeCustomerOrders(
    orders,
    (payRows ?? []) as { order_id: string; amount_paise: number; status: string }[],
    (entryRows ?? []) as {
      order_id: string;
      entry_type: "payment" | "refund";
      method: string;
      amount_paise: number;
    }[],
  );

  return NextResponse.json({
    mode: "live",
    customer: {
      id: profile.id,
      name: profile.name,
      email,
      phone: profile.phone,
      role: profile.role,
      disabled: Boolean(profile.disabled),
      createdAt: profile.created_at,
      ...summary,
    },
    addresses: (addressRows ?? []).map((a) => ({
      id: a.id,
      label: a.label,
      line: a.line,
      area: a.area,
      city: a.city,
      pincode: a.pincode,
      createdAt: a.created_at,
    })),
    orders: orders.slice(0, 20).map((o) => ({
      id: o.id,
      status: o.status,
      paymentStatus: o.payment_status,
      totalPaise: o.total_paise,
      deliveryType: o.delivery_type,
      itemCount: itemCountByOrder.get(o.id) ?? 0,
      createdAt: o.created_at,
    })),
    vouchers: (voucherRows ?? []).map((v) => ({
      id: v.id,
      code: v.code,
      kind: v.kind,
      status: v.status,
      balancePaise: v.balance_paise,
      faceValuePaise: v.face_value_paise,
      discountType: v.discount_type,
      discountValue: v.discount_value,
      validUntil: v.valid_until,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;
  const { supabase, user } = gate;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = customerDisabledSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please fix the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  const { data: existing, error: loadError } = await supabase
    .from("profiles")
    .select("id, name, disabled")
    .eq("id", id)
    .maybeSingle();
  if (loadError) {
    return NextResponse.json({ error: "Could not load the customer." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({
      disabled: parsed.data.disabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, disabled")
    .single();
  if (error || !updated) {
    return NextResponse.json(
      { error: "Could not update the account." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: parsed.data.disabled ? "customer.disable" : "customer.enable",
    entity: "profiles",
    entityId: id,
    details: {
      from: Boolean(existing.disabled),
      to: parsed.data.disabled,
      customerName: existing.name ?? null,
    },
  });

  return NextResponse.json({
    mode: "live",
    customer: { id: updated.id, disabled: Boolean(updated.disabled) },
  });
}
