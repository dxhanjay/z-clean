import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { orderSchema } from "@/lib/validation";
import { isPincodeServiceable } from "@/lib/pricing";
import { computeOrderTotals } from "@/lib/totals";
import {
  createRazorpayOrder,
  isRazorpayConfigured,
  loadCatalogue,
  resolveCoupon,
} from "@/lib/orders-server";
import { pickupSlotIso } from "@/lib/slot-time";

/**
 * POST /api/orders — place an order (Phase 3).
 *
 * Trust model: the client sends items, choices and the total IT computed
 * with the shared totals engine. The server then RE-CALCULATES everything
 * from catalogue data (the `price_items` table when Supabase is configured,
 * the approved local catalogue otherwise) and REJECTS the order with 409
 * when the totals do not match. Client totals are never trusted.
 *
 * Modes:
 *  - Supabase not configured → validation + recalculation still run, then
 *    503 { mode: "demo" } and the client stores the order locally, badged
 *    DEMO MODE (same pattern as /api/pickups). Nothing is faked.
 *  - Supabase configured → the signed-in customer's order, its items and
 *    the first status-history row are inserted (RLS applies; sign-in is
 *    required because orders.user_id is mandatory).
 *      · Pay on Delivery → payment_status "cod_pending", status
 *        PICKUP_SCHEDULED, immediate confirmation.
 *      · Razorpay → a Razorpay order is created server-side (test mode
 *        keys), a payments row is stored as "created", and the gateway
 *        order id is returned for Checkout. The order stays
 *        PAYMENT_PENDING until the verified webhook confirms payment —
 *        the browser callback alone never marks an order paid.
 */

function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) },
      { status: 422 },
    );
  }
  const data = parsed.data;

  if (!isPincodeServiceable(data.pincode)) {
    return NextResponse.json(
      {
        error:
          "Sorry, we are not serviceable at this pincode yet. We currently serve Bokaro Steel City (827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014, 829301).",
        fieldErrors: { pincode: "Not serviceable yet" },
      },
      { status: 422 },
    );
  }

  const supabase = await createClient();

  // Who is ordering? Live orders need an account (orders.user_id NOT NULL).
  let userId: string | null = null;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "Please sign in to place an order.", code: "AUTH_REQUIRED" },
        { status: 401 },
      );
    }
  }

  // First-order check for first-order-only coupons.
  let isFirstOrder = true;
  if (supabase && userId) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    isFirstOrder = (count ?? 0) === 0;
  }

  // Server-side recalculation from catalogue data — never trust the client.
  const catalogue = await loadCatalogue(supabase);
  const couponCode = data.couponCode?.trim().toUpperCase() || undefined;
  const resolved = couponCode
    ? await resolveCoupon(supabase, couponCode)
    : { coupon: null, couponId: null };

  const totals = computeOrderTotals({
    items: data.items,
    deliveryType: data.deliveryType,
    couponCode,
    coupon: couponCode ? resolved.coupon : undefined,
    isFirstOrder,
    catalogue: catalogue.entries,
  });
  if (!totals.ok) {
    return NextResponse.json(
      { error: totals.error, code: totals.code },
      { status: 422 },
    );
  }

  if (data.expectedTotalPaise !== totals.totalPaise) {
    return NextResponse.json(
      {
        error:
          "The total changed while you were ordering (prices are confirmed on the server). Please review the updated total and try again.",
        code: "TOTAL_MISMATCH",
        serverTotalPaise: totals.totalPaise,
      },
      { status: 409 },
    );
  }

  // Demo mode: fully validated + recalculated, but there is no database.
  if (!supabase || !userId) {
    return NextResponse.json(
      { mode: "demo", message: "Supabase not configured — demo mode.", totals },
      { status: 503 },
    );
  }

  // --- Live mode: persist address, order, items, first history row. ---
  const { data: address, error: addressError } = await supabase
    .from("addresses")
    .insert({
      user_id: userId,
      label: "Order address",
      line: data.addressLine,
      area: data.area,
      city: data.city,
      pincode: data.pincode,
    })
    .select("id")
    .single();
  if (addressError || !address) {
    return NextResponse.json(
      { error: "Could not save your address. Please try again." },
      { status: 500 },
    );
  }

  const isCod = data.paymentMethod === "cod";
  const initialStatus = isCod ? "PICKUP_SCHEDULED" : "PAYMENT_PENDING";
  const initialPaymentStatus = isCod ? "cod_pending" : "pending";

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      address_id: address.id,
      delivery_type: data.deliveryType,
      payment_method: data.paymentMethod,
      status: initialStatus,
      payment_status: initialPaymentStatus,
      pickup_slot: pickupSlotIso(data.pickupDate, data.pickupSlot),
      subtotal_paise: totals.subtotalPaise,
      discount_paise: totals.discountPaise,
      total_paise: totals.totalPaise,
      coupon_id: totals.couponApplied ? resolved.couponId : null,
    })
    .select("id, status, payment_status, created_at")
    .single();
  if (orderError || !order) {
    return NextResponse.json(
      { error: "Could not place your order. Please try again." },
      { status: 500 },
    );
  }

  const itemRows = totals.lines.map((line) => ({
    order_id: order.id,
    price_item_id: catalogue.priceItemIds
      ? (catalogue.priceItemIds.get(`${line.serviceSlug}::${line.itemName}`) ?? null)
      : null,
    qty: line.qty,
    unit_price_paise: line.unitPricePaise,
    line_total_paise: line.lineTotalPaise,
  }));
  const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
  if (itemsError) {
    return NextResponse.json(
      { error: "Your order was created but its items could not be saved. Please contact us with your order reference.", orderId: order.id },
      { status: 500 },
    );
  }

  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: initialStatus,
    note: isCod
      ? "Order placed — pay on delivery."
      : "Order placed — awaiting online payment.",
    actor_id: userId,
  });

  // COD: done — pickup is scheduled, payment happens at delivery.
  if (isCod) {
    return NextResponse.json(
      {
        mode: "live",
        orderId: order.id,
        status: order.status,
        paymentStatus: order.payment_status,
        totals,
      },
      { status: 201 },
    );
  }

  // Razorpay: create the gateway order server-side (test mode keys).
  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      {
        mode: "live",
        orderId: order.id,
        status: order.status,
        paymentStatus: order.payment_status,
        totals,
        payment: { gateway: "razorpay", gatewayConfigured: false },
      },
      { status: 201 },
    );
  }

  const gatewayOrder = await createRazorpayOrder({
    amountPaise: totals.totalPaise,
    receipt: order.id,
  });
  if (!gatewayOrder) {
    return NextResponse.json(
      {
        error:
          "Your order is saved as payment pending, but online payment could not be started. Please contact us to complete the payment, or place a new order with Pay on Delivery.",
        orderId: order.id,
      },
      { status: 502 },
    );
  }

  await supabase.from("payments").insert({
    order_id: order.id,
    gateway: "razorpay",
    gateway_order_id: gatewayOrder.id,
    amount_paise: totals.totalPaise,
    status: "created",
  });

  return NextResponse.json(
    {
      mode: "live",
      orderId: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      totals,
      payment: {
        gateway: "razorpay",
        gatewayConfigured: true,
        gatewayOrderId: gatewayOrder.id,
        amountPaise: totals.totalPaise,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    },
    { status: 201 },
  );
}

/** GET /api/orders — the signed-in customer's orders (live mode only). */
export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ mode: "demo", orders: [] }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, payment_status, payment_method, delivery_type, pickup_slot, subtotal_paise, discount_paise, total_paise, created_at, order_items ( qty )",
    )
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Could not load your orders." }, { status: 500 });
  }
  return NextResponse.json({ mode: "live", orders: data ?? [] });
}
