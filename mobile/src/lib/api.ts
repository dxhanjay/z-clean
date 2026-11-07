import { API_BASE_URL } from "./config";
import { supabase } from "./supabase";
import type {
  AdminCustomerDetailData,
  AdminCustomersPage,
  AdminNotificationsData,
  AdminOrderDetail,
  AdminOrderSummary,
  AnalyticsData,
  Branch,
  CashClosing,
  CustomerOrderDetail,
  Employee,
  ExpenseRow,
  FinanceOverview,
  GiftVoucher,
  MyOrderSummary,
  OrderPaymentsView,
  OrderReview,
  OutstandingRow,
  PlaceOrderResult,
  PricingGroup,
  RefundView,
  ReportsData,
  SettingRow,
  StagesResult,
  VoucherDetail,
} from "./types";

/**
 * API client for the Sri Clean Next backend (Mobile Phase 1).
 *
 * Every call carries the current Supabase session's access token as
 * `Authorization: Bearer <token>` — the contract documented in the
 * web README's Mobile section. The server validates the token with
 * the Supabase Auth server and runs the query under the user's RLS.
 * No token → the server answers 401, surfaced here as ApiError.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string>;

  constructor(status: number, message: string, code?: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    fieldErrors?: Record<string, string>;
  } & T;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json.error ?? `Request failed (${res.status}). Please try again.`,
      json.code,
      json.fieldErrors,
    );
  }
  return json;
}

/* ---------------- Pricing terms ---------------- */

export interface ServerPricingTerms {
  minimumOrderPaise: number;
  freeDeliveryThresholdPaise: number;
  deliveryFeePaise: number;
}

let pricingTermsCache: ServerPricingTerms | null = null;

/**
 * Effective money terms from GET /api/pricing-terms, cached for the app
 * session. Returns null on any failure — callers then fall back to the
 * approved constants in lib/totals.ts, exactly as the server does.
 */
export async function fetchPricingTerms(): Promise<ServerPricingTerms | null> {
  if (pricingTermsCache) return pricingTermsCache;
  try {
    const terms = await apiFetch<ServerPricingTerms>("/api/pricing-terms");
    if (
      Number.isInteger(terms.minimumOrderPaise) &&
      Number.isInteger(terms.freeDeliveryThresholdPaise)
    ) {
      pricingTermsCache = terms;
      return terms;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------------- Auth ---------------- */

/**
 * Request a password-reset email (P0). The server ALWAYS answers
 * 200 { ok: true } — account existence is never revealed — so this
 * resolves quietly either way. The emailed link opens the WEB
 * reset page (/reset-password); there is no in-app reset screen.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/auth/reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/* ---------------- Push notifications (Delta 2) ---------------- */

/**
 * Register this device's Expo push token for the signed-in user
 * (POST /api/push/register). The server upserts on the token, so a
 * token moving between accounts on a shared device is reassigned.
 */
export async function registerPushToken(
  token: string,
  platform: "android" | "ios" | "web",
): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/push/register", {
    method: "POST",
    body: JSON.stringify({ token, platform }),
  });
}

/** Remove this device's token for the signed-in user (logout / off). */
export async function unregisterPushToken(token: string): Promise<void> {
  await apiFetch<{ ok: boolean }>("/api/push/register", {
    method: "DELETE",
    body: JSON.stringify({ token }),
  });
}

/* ---------------- Customer ---------------- */

export interface PlaceOrderBody {
  name: string;
  phone: string;
  addressLine: string;
  area: string;
  city: string;
  pincode: string;
  pickupDate: string;
  pickupSlot: string;
  deliveryType: "regular" | "express";
  note?: string;
  items: { serviceSlug: string; itemName: string; qty: number }[];
  paymentMethod: "cod";
  voucherCode?: string;
  expectedTotalPaise: number;
}

export async function placeOrder(body: PlaceOrderBody): Promise<PlaceOrderResult> {
  return apiFetch<PlaceOrderResult>("/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchMyOrders(): Promise<MyOrderSummary[]> {
  const data = await apiFetch<{ mode: string; orders: MyOrderSummary[] }>("/api/orders");
  return data.orders ?? [];
}

export async function fetchOrderDetail(id: string): Promise<CustomerOrderDetail> {
  const data = await apiFetch<{ mode: string; order: CustomerOrderDetail }>(`/api/orders/${id}`);
  return data.order;
}

/* ---------------- Reviews (Delta 3) ---------------- */

/**
 * Submit a review for a DELIVERED order (POST /api/reviews). The
 * review is created UNAPPROVED — staff moderation publishes it.
 * Throws ApiError with code "ALREADY_REVIEWED" (409) or
 * "ORDER_NOT_DELIVERED" (422) from the server's integrity checks.
 */
export async function submitReview(
  orderId: string,
  rating: number,
  text: string,
): Promise<OrderReview> {
  const data = await apiFetch<{ mode: string; review: OrderReview }>("/api/reviews", {
    method: "POST",
    body: JSON.stringify({ orderId, rating, text }),
  });
  return data.review;
}

/* ---------------- Admin ---------------- */

export async function fetchAdminOrders(): Promise<AdminOrderSummary[]> {
  const data = await apiFetch<{ mode: string; orders: AdminOrderSummary[] }>("/api/admin/orders");
  return data.orders ?? [];
}

export async function fetchAdminOrderDetail(id: string): Promise<AdminOrderDetail> {
  const data = await apiFetch<{ mode: string; order: AdminOrderDetail }>(`/api/admin/orders/${id}`);
  return data.order;
}

export async function patchAdminOrderStatus(
  id: string,
  body: { status?: string; note?: string; codCollected?: boolean },
): Promise<{ status: string; paymentStatus: string }> {
  return apiFetch(`/api/admin/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/* ------------- Mobile Phase 2 — handovers & stage queues ------------- */

export interface HandoverBody {
  pointId: string;
  toEmployeeId: string;
  method: "qr" | "otp";
  otp?: string;
  qrToken?: string;
  quantity: number;
  codCollected?: boolean;
  missingItem?: boolean;
  note?: string;
}

export interface HandoverResult {
  mode: string;
  orderId: string;
  handover: { id: string; pointId: string; flags: string[]; quantity: number; expectedQuantity: number; at: string };
  status: string;
  paymentStatus: string;
  nextPoint: { id: string; label: string } | null;
}

export async function completeHandover(orderId: string, body: HandoverBody): Promise<HandoverResult> {
  return apiFetch<HandoverResult>(`/api/admin/orders/${orderId}/handover`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function regenerateOtp(
  orderId: string,
  which: "pickup" | "delivery",
): Promise<{ otp: string; which: string }> {
  return apiFetch(`/api/admin/orders/${orderId}/regenerate-otp`, {
    method: "POST",
    body: JSON.stringify({ which }),
  });
}

export async function fetchStages(employeeId?: string): Promise<StagesResult> {
  const q = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  const data = await apiFetch<{ mode: string } & StagesResult>(`/api/admin/stages${q}`);
  return { employees: data.employees ?? [], employee: data.employee ?? null, queues: data.queues ?? [] };
}

/* ------------- Mobile Phase 2 — employees & branches ------------- */

export async function fetchEmployees(): Promise<Employee[]> {
  const data = await apiFetch<{ mode: string; employees: Employee[] }>("/api/admin/employees");
  return data.employees ?? [];
}

export interface EmployeeBody {
  employeeCode?: string;
  fullName: string;
  phone: string;
  email?: string;
  branchId?: string | null;
  managerId?: string | null;
  joiningDate?: string;
  employmentStatus?: "active" | "inactive";
  roles: string[];
}

export async function createEmployee(body: EmployeeBody): Promise<Employee> {
  const data = await apiFetch<{ mode: string; employee: Employee }>("/api/admin/employees", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.employee;
}

export async function updateEmployee(id: string, body: Partial<EmployeeBody>): Promise<void> {
  // PATCH answers { mode, employeeId, changed: <raw row> } — callers
  // reload the composed list instead of trusting that shape.
  await apiFetch(`/api/admin/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchBranches(): Promise<Branch[]> {
  const data = await apiFetch<{ mode: string; branches: Branch[] }>("/api/admin/branches");
  return data.branches ?? [];
}

export interface BranchBody {
  name: string;
  type: string;
  address?: string;
  area?: string;
  pincode?: string;
  managerEmployeeId?: string | null;
  active?: boolean;
}

export async function createBranch(body: BranchBody): Promise<void> {
  await apiFetch("/api/admin/branches", { method: "POST", body: JSON.stringify(body) });
}

export async function updateBranch(id: string, body: Partial<BranchBody>): Promise<void> {
  await apiFetch(`/api/admin/branches/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

/* ------------- Mobile Phase 2 — gift vouchers ------------- */

export async function fetchVouchers(): Promise<GiftVoucher[]> {
  const data = await apiFetch<{ mode: string; vouchers: GiftVoucher[] }>("/api/admin/vouchers");
  return data.vouchers ?? [];
}

export interface VoucherCreateBody {
  kind: "prepaid_card" | "promo";
  quantity?: number;
  faceValuePaise?: number;
  discountType?: "fixed" | "percent";
  discountValue?: number;
  maxDiscountPaise?: number | null;
  minOrderPaise?: number;
  eligibleServices?: string[];
  branchId?: string | null;
  usageLimit?: number;
  validFrom?: string | null;
  validUntil?: string | null;
}

export async function createVouchers(body: VoucherCreateBody): Promise<GiftVoucher[]> {
  const data = await apiFetch<{ mode: string; vouchers: GiftVoucher[] }>("/api/admin/vouchers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.vouchers ?? [];
}

export async function fetchVoucherDetail(id: string): Promise<VoucherDetail> {
  const data = await apiFetch<{ mode: string } & VoucherDetail>(`/api/admin/vouchers/${id}`);
  return { voucher: data.voucher, transactions: data.transactions ?? [] };
}

export async function patchVoucher(
  id: string,
  body: {
    action: "issue" | "cancel" | "expire";
    issuedToName?: string;
    issuedToPhone?: string;
    issuedToEmployeeId?: string | null;
  },
): Promise<GiftVoucher> {
  const data = await apiFetch<{ mode: string; voucher: GiftVoucher }>(`/api/admin/vouchers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return data.voucher;
}

/* ------------- Mobile Phase 3 — finance ------------- */

export async function fetchFinanceOverview(date: string): Promise<FinanceOverview> {
  const data = await apiFetch<{ mode: string } & FinanceOverview>(
    `/api/admin/finance/overview?date=${encodeURIComponent(date)}`,
  );
  return {
    date: data.date,
    collections: data.collections ?? [],
    totalCollectedPaise: data.totalCollectedPaise,
    refundsProcessedPaise: data.refundsProcessedPaise,
    refundsProcessedCount: data.refundsProcessedCount,
    expensesTotalPaise: data.expensesTotalPaise,
    netCollectedPaise: data.netCollectedPaise,
    expectedCashPaise: data.expectedCashPaise,
    closing: data.closing ?? null,
  };
}

export async function fetchClosings(): Promise<CashClosing[]> {
  const data = await apiFetch<{ mode: string; closings: CashClosing[] }>("/api/admin/finance/closings");
  return data.closings ?? [];
}

export async function closeDay(body: {
  date: string;
  countedCashPaise: number;
  note?: string;
}): Promise<{ expectedCashPaise: number; countedCashPaise: number; differencePaise: number }> {
  return apiFetch("/api/admin/finance/close-day", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchOutstanding(): Promise<OutstandingRow[]> {
  const data = await apiFetch<{ mode: string; orders: OutstandingRow[] }>("/api/admin/finance/outstanding");
  return data.orders ?? [];
}

export async function fetchRefundQueue(): Promise<RefundView[]> {
  const data = await apiFetch<{ mode: string; refunds: RefundView[] }>("/api/admin/refunds");
  return data.refunds ?? [];
}

export async function patchRefund(
  id: string,
  action: "approve" | "reject" | "process",
): Promise<{ status: string; paymentStatus?: string }> {
  return apiFetch(`/api/admin/refunds/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

/* ------------- Mobile Phase 3 — expenses ------------- */

export async function fetchExpenses(params?: { from?: string; to?: string }): Promise<ExpenseRow[]> {
  const q = new URLSearchParams();
  if (params?.from) q.set("from", params.from);
  if (params?.to) q.set("to", params.to);
  const qs = q.toString();
  const data = await apiFetch<{ mode: string; expenses: ExpenseRow[] }>(
    `/api/admin/expenses${qs ? `?${qs}` : ""}`,
  );
  return data.expenses ?? [];
}

export async function createExpense(body: {
  expenseDate: string;
  category: string;
  description?: string;
  amountPaise: number;
  branchId?: string | null;
}): Promise<void> {
  await apiFetch("/api/admin/expenses", { method: "POST", body: JSON.stringify(body) });
}

export async function deleteExpense(id: string): Promise<void> {
  await apiFetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
}

/* ------------- Mobile Phase 3 — per-order payments & refunds ------------- */

export async function fetchOrderPayments(id: string): Promise<OrderPaymentsView> {
  const data = await apiFetch<{ mode: string } & OrderPaymentsView>(`/api/admin/orders/${id}/payments`);
  return {
    paymentStatus: data.paymentStatus,
    paymentMethod: data.paymentMethod,
    orderStatus: data.orderStatus,
    finance: data.finance,
    gatewayPayments: data.gatewayPayments ?? [],
    entries: data.entries ?? [],
    refunds: data.refunds ?? [],
  };
}

export async function recordPayment(
  id: string,
  body: { method: string; amountPaise: number; reference?: string; note?: string },
): Promise<{ paymentStatus: string }> {
  return apiFetch(`/api/admin/orders/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function requestRefund(
  id: string,
  body: { amountPaise: number; reason: string; method: string },
): Promise<{ refundId: string; status: string }> {
  return apiFetch(`/api/admin/orders/${id}/refunds`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/* ------------- Mobile Phase 3 — reports ------------- */

export async function fetchReports(days: number): Promise<ReportsData> {
  const data = await apiFetch<{ mode: string; reports: ReportsData }>(`/api/admin/reports?days=${days}`);
  return data.reports;
}

/* ------------- Mobile Phase 3 — pricing & settings editors ------------- */

export async function fetchPricing(): Promise<PricingGroup[]> {
  const data = await apiFetch<{ mode: string; groups: PricingGroup[] }>("/api/admin/pricing");
  return data.groups ?? [];
}

export async function patchPricing(
  id: string,
  body: { pricePaise?: number; expressMultiplier?: number; active?: boolean },
): Promise<{ item: { pricePaise: number; unitLabel: string } }> {
  return apiFetch(`/api/admin/pricing/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchSettings(): Promise<SettingRow[]> {
  const data = await apiFetch<{ mode: string; settings: SettingRow[] }>("/api/admin/settings");
  return data.settings ?? [];
}

export async function patchSettings(values: Record<string, string | null>): Promise<SettingRow[]> {
  const data = await apiFetch<{ mode: string; settings: SettingRow[] }>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify({ values }),
  });
  return data.settings ?? [];
}

/* ------------- Delta 1 — analytics, customers, notifications ------------- */

export async function fetchAnalytics(days: number): Promise<AnalyticsData> {
  return apiFetch<AnalyticsData>(`/api/admin/analytics?days=${days}`);
}

export async function fetchAdminCustomers(params?: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminCustomersPage> {
  const query = new URLSearchParams();
  if (params?.q) query.set("q", params.q);
  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<AdminCustomersPage>(`/api/admin/customers${suffix}`);
}

export async function fetchAdminCustomer(id: string): Promise<AdminCustomerDetailData> {
  return apiFetch<AdminCustomerDetailData>(`/api/admin/customers/${id}`);
}

export async function patchCustomerDisabled(
  id: string,
  disabled: boolean,
): Promise<{ customer: { id: string; disabled: boolean } }> {
  return apiFetch(`/api/admin/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ disabled }),
  });
}

export async function fetchAdminNotifications(): Promise<AdminNotificationsData> {
  return apiFetch<AdminNotificationsData>("/api/admin/notifications");
}
