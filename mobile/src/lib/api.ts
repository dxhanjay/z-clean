import { API_BASE_URL } from "./config";
import { supabase } from "./supabase";
import type {
  AdminOrderDetail,
  AdminOrderSummary,
  CustomerOrderDetail,
  MyOrderSummary,
  PlaceOrderResult,
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
