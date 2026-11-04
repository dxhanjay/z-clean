import { API_BASE_URL } from "./config";
import { supabase } from "./supabase";
import type {
  AdminOrderDetail,
  AdminOrderSummary,
  Branch,
  CustomerOrderDetail,
  Employee,
  GiftVoucher,
  MyOrderSummary,
  PlaceOrderResult,
  StagesResult,
  VoucherDetail,
} from "./types";

/**
 * API client for the Z-clean Next backend (Mobile Phase 1).
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
