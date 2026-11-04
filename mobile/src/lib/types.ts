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

/** One recorded handover, as composed by GET /api/admin/orders/[id]. */
export interface HandoverView {
  id: string;
  pointId: string;
  pointLabel: string;
  fromStage: string;
  toStage: string;
  method: string;
  fromEmployeeId: string | null;
  fromEmployeeName: string | null;
  toEmployeeId: string | null;
  toEmployeeName: string | null;
  quantity: number;
  expectedQuantity: number;
  flags: string[];
  note: string | null;
  at: string;
}

/** OTP states only — the codes themselves are the customer's. */
export interface OtpStateView {
  pickupSet: boolean;
  pickupUsedAt: string | null;
  deliverySet: boolean;
  deliveryUsedAt: string | null;
  attempts: number;
  locked: boolean;
}

/** The chain point the server says this order awaits next. */
export interface HandoverPointView {
  id: string;
  label: string;
  customerLabel: string;
  stage: string | null;
  fromRole: string;
  fromLabel: string;
  toRole: string;
  alsoToRoles: string[];
  toLabel: string;
  method: "qr" | "otp";
  otpKind: "pickup" | "delivery" | null;
  statusEffect: string | null;
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
  qr_payload: string | null;
  otp_state: OtpStateView;
  handovers: HandoverView[];
  next_point: HandoverPointView | null;
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

/* ---------------- Mobile Phase 2 — admin operations ---------------- */

/** Employee shape from GET /api/admin/employees (web org compose). */
export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  phone: string;
  email: string | null;
  userId: string | null;
  branchId: string | null;
  branchName: string | null;
  managerId: string | null;
  managerName: string | null;
  employmentStatus: "active" | "inactive";
  joiningDate: string | null;
  roles: string[];
  createdAt: string;
}

/** Branch shape from GET /api/admin/branches. */
export interface Branch {
  id: string;
  name: string;
  type: string;
  address: string | null;
  area: string | null;
  pincode: string | null;
  managerEmployeeId: string | null;
  managerName: string | null;
  active: boolean;
  createdAt: string;
}

/** Picker-list employee from GET /api/admin/stages. */
export interface StageEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  employmentStatus: string;
  roles: string[];
}

export interface StageQueueOrder {
  id: string;
  status: string;
  itemCount: number;
  customerName: string | null;
  createdAt: string;
  pickupSlot: string;
}

export interface StageQueue {
  pointId: string;
  label: string;
  stage: string | null;
  method: string;
  toRole: string;
  count: number;
  orders: StageQueueOrder[];
}

export interface StagesResult {
  employees: StageEmployee[];
  employee: StageEmployee | null;
  queues: StageQueue[];
}

/** Gift voucher shape from GET /api/admin/vouchers (rowToVoucher). */
export interface GiftVoucher {
  id: string;
  code: string;
  kind: "prepaid_card" | "promo";
  faceValuePaise: number | null;
  balancePaise: number | null;
  discountType: "fixed" | "percent" | null;
  discountValue: number | null;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  eligibleServices: string[];
  branchId: string | null;
  branchName: string | null;
  usageLimit: number;
  timesUsed: number;
  status: string;
  issuedToName: string | null;
  issuedToPhone: string | null;
  issuedToEmployeeId: string | null;
  issuedByLabel: string | null;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
}

export interface VoucherTransaction {
  id: string;
  voucherId: string;
  orderId: string | null;
  txnType: string;
  amountPaise: number;
  balanceAfterPaise: number | null;
  actorLabel: string | null;
  note: string | null;
  createdAt: string;
}

export interface VoucherDetail {
  voucher: GiftVoucher;
  transactions: VoucherTransaction[];
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
