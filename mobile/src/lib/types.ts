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

/* ---------------- Mobile Phase 3 — finance, reports, editors ---------------- */

/** One row of the staff money ledger (GET /api/admin/orders/[id]/payments). */
export interface PaymentEntryView {
  id: string;
  entryType: "payment" | "refund";
  method: string;
  amountPaise: number;
  reference: string | null;
  note: string | null;
  recordedByEmployeeId: string | null;
  recordedByEmployeeName: string | null;
  actorLabel: string | null;
  createdAt: string;
}

export interface GatewayPaymentView {
  id: string;
  gateway: string;
  amountPaise: number;
  status: string;
  gatewayPaymentId: string | null;
  createdAt: string;
}

export interface RefundView {
  id: string;
  orderId?: string;
  amountPaise: number;
  reason: string;
  method: string;
  status: "requested" | "approved" | "rejected" | "processed";
  requestedByLabel: string | null;
  decidedByLabel: string | null;
  decidedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  /** Present on the cross-order refund queue (GET /api/admin/refunds). */
  customer?: string;
  phone?: string | null;
  orderTotalPaise?: number | null;
}

/** The one finance computation for an order (web src/lib/finance.ts OrderFinance). */
export interface OrderFinanceBreakdown {
  totalPaise: number;
  gatewayPaidPaise: number;
  entriesPaidPaise: number;
  basePaidPaise: number;
  legacySettled: boolean;
  effectivePaidPaise: number;
  outstandingPaise: number;
  refundsProcessedPaise: number;
  refundsPendingPaise: number;
  refundablePaise: number;
}

export interface OrderPaymentsView {
  paymentStatus: string;
  paymentMethod: string;
  orderStatus: string;
  finance: OrderFinanceBreakdown;
  gatewayPayments: GatewayPaymentView[];
  entries: PaymentEntryView[];
  refunds: RefundView[];
}

export interface CashClosing {
  id: string;
  date: string;
  expectedCashPaise: number;
  countedCashPaise: number;
  differencePaise: number;
  closedByLabel: string | null;
  note: string | null;
  createdAt: string;
}

export interface FinanceOverview {
  date: string;
  collections: { method: string; gatewayPaise: number; entriesPaise: number; totalPaise: number }[];
  totalCollectedPaise: number;
  refundsProcessedPaise: number;
  refundsProcessedCount: number;
  expensesTotalPaise: number;
  netCollectedPaise: number;
  expectedCashPaise: number;
  closing: CashClosing | null;
}

export interface OutstandingRow {
  orderId: string;
  status: string;
  paymentStatus: string;
  customer: string;
  phone: string | null;
  area: string | null;
  city: string | null;
  totalPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  ageDays: number;
  createdAt: string;
}

export interface ExpenseRow {
  id: string;
  expenseDate: string;
  category: string;
  description: string | null;
  amountPaise: number;
  branchId: string | null;
  branchName: string | null;
  actorLabel: string | null;
  createdAt: string;
}

/* Reports — mirrors web src/lib/reports.ts Reports. */
export interface KeyValueTotal {
  key: string;
  label: string;
  orders: number;
  grossPaise: number;
}

export interface ReportsData {
  salesByDay: { date: string; orders: number; grossPaise: number; collectedPaise: number }[];
  salesByService: KeyValueTotal[];
  salesByArea: KeyValueTotal[];
  processedByPlant: KeyValueTotal[];
  pendingAging: {
    bucket: string;
    count: number;
    orders: { id: string; status: string; ageDays: number; totalPaise: number }[];
  }[];
  employeePerformance: {
    employeeId: string;
    name: string;
    handovers: number;
    flagsRaised: number;
    deliveries: number;
  }[];
  voucherUsage: {
    created: number;
    issued: number;
    redeemed: number;
    outstandingLiabilityPaise: number;
    discountGivenPaise: number;
    redeemedValuePaise: number;
  };
  retention: {
    customers: number;
    repeatCustomers: number;
    repeatRatePercent: number;
    topCustomers: { label: string; orders: number; grossPaise: number }[];
  };
  expensesByCategory: { category: string; totalPaise: number }[];
  salesVsExpense: {
    grossPaise: number;
    collectedPaise: number;
    expensesPaise: number;
    netPaise: number;
  };
}

/** Pricing editor shapes (GET /api/admin/pricing). */
export interface PricingItem {
  id: string;
  name: string;
  pricePaise: number;
  unit: string;
  unitLabel: string;
  expressMultiplier: number;
  active: boolean;
}

export interface PricingGroup {
  serviceId: string;
  slug: string;
  title: string;
  items: PricingItem[];
}

/** Settings editor row (GET /api/admin/settings). */
export interface SettingRow {
  key: string;
  value: string | null;
  updated_at?: string;
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
