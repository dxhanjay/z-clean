/**
 * API response shapes — these mirror the web routes exactly
 * (POST/GET /api/orders, GET /api/orders/[id], the admin order
 * routes). Field names are the server's snake_case payloads.
 */

export interface MyOrderSummary {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_type: string;
  pickup_slot: string;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  created_at: string;
  order_items?: { qty: number }[];
}

export interface OrderHistoryEntry {
  status: string;
  note: string | null;
  at: string;
}

export interface OrderFinancePayment {
  label: string;
  amountPaise: number;
  at: string;
}

export interface OrderFinance {
  effectivePaidPaise: number;
  outstandingPaise: number;
  refundsProcessedPaise: number;
  legacySettled: boolean;
  payments: OrderFinancePayment[];
  refunds: OrderFinancePayment[];
}

export interface CustomerOrderDetail {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_type: string;
  pickup_slot: string;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  created_at: string;
  voucher_code: string | null;
  voucher_discount_paise: number;
  voucher_redeemed_paise: number;
  pickup_otp: string | null;
  delivery_otp: string | null;
  pickup_otp_used_at: string | null;
  delivery_otp_used_at: string | null;
  qr_payload: string | null;
  delivery_fee_paise: number;
  finance: OrderFinance | null;
  handover_milestones: {
    pointId: string;
    label: string;
    method: string;
    quantity: number;
    at: string;
  }[];
  addresses: { line: string; area: string | null; city: string; pincode: string } | null;
  history: OrderHistoryEntry[];
  items: {
    itemName: string;
    serviceSlug: string;
    qty: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }[];
}

export interface AdminOrderSummary {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_type: string;
  pickup_slot: string;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  created_at: string;
  profiles: { name: string | null; phone: string | null } | null;
  addresses: { line: string; area: string | null; city: string; pincode: string } | null;
  order_items?: { qty: number }[];
}

export interface AdminOrderDetail {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_type: string;
  pickup_slot: string;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  created_at: string;
  voucher_code: string | null;
  voucher_discount_paise: number;
  voucher_redeemed_paise: number;
  delivery_fee_paise: number;
  item_count: number;
  profiles: { name: string | null; phone: string | null } | null;
  addresses: { line: string; area: string | null; city: string; pincode: string } | null;
  items: {
    itemName: string;
    serviceSlug: string;
    qty: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }[];
  history: (OrderHistoryEntry & { actorId?: string | null })[];
}

export interface PlaceOrderResult {
  mode: string;
  orderId: string;
  status: string;
  paymentStatus: string;
  finalTotalPaise?: number;
  voucher?: {
    code: string;
    kind: string;
    discountPaise: number;
    redeemedPaise: number;
    amountDuePaise: number;
  } | null;
}
