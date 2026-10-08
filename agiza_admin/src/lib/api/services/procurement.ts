import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { HistoryEntry, PersonRef } from "./orders";

/* ------------------------------------------------------------------ types */

export type ProcurementStatus =
  | "pending_sourcing"
  | "supplier_selected"
  | "paid"
  | "supplier_shipped"
  | "supplier_cancelled"
  | "received_at_cargo"
  | "cancelled";

export type ExceptionFlag =
  | ""
  | "payment_issue"
  | "supplier_delay"
  | "quality_concern"
  | "stock_unavailable"
  | "parcel_lost";

export type ProcurementAction = "select_supplier" | "mark_paid" | "mark_shipped" | "cancel_supplier";

export interface ProcurementOrder {
  id: number;
  order: {
    id: number;
    reference: string;
    status: string;
    status_display: string;
    item_details: string;
    customer: string;
    service_type: string;
    service_type_display: string;
    created_at: string;
  };
  origin: { iso2: string; name: string };
  status: ProcurementStatus;
  status_display: string;
  supplier: { id: number; name: string; reference: string } | null;
  supplier_order_number: string;
  supplier_tracking_number: string;
  operator: PersonRef | null;
  quantity: number;
  unit_cost: string | null;
  item_cost: string | null;
  currency: string;
  payment_reference: string;
  exception_flag: ExceptionFlag;
  exception_flag_display: string;
  expected_at_cargo: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  notes: string;
  actions: ProcurementAction[];
  /** The order's photos for reference: the customer's request photos and the ones staff added. */
  photos: ProcurementPhoto[];
  created_at: string;
  updated_at: string;
}

export interface ProcurementPhoto {
  id: number;
  /** Relative to the API root; open it through `fileSrc`. */
  url: string;
  caption: string;
  from_customer: boolean;
}

export interface ProcurementStats {
  total: number;
  pending_sourcing: number;
  paid: number;
  shipped: number;
  received_at_cargo: number;
  with_exceptions: number;
  total_value: string;
}

export interface Operator {
  id: number;
  full_name: string;
  staff_level: string;
}

export interface Supplier {
  id: number;
  reference: string;
  name: string;
  country_detail: { id: number; iso2: string; name: string };
  contact_person: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  notes: string;
  is_active: boolean;
  orders_count: number;
  created_at: string;
  updated_at: string;
}

export interface SupplierInput {
  name: string;
  country: number;
  contact_person: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  notes: string;
  is_active: boolean;
}

export type ProcurementUpdate = Partial<{
  operator: number | null;
  quantity: number;
  unit_cost: string | null;
  item_cost: string | null;
  exception_flag: ExceptionFlag;
  expected_at_cargo: string | null;
  supplier_tracking_number: string;
  supplier_order_number: string;
  notes: string;
}>;

export interface SelectSupplierInput {
  supplier: number;
  item_cost?: string | null;
  unit_cost?: string | null;
  quantity?: number;
  expected_at_cargo?: string | null;
  supplier_order_number?: string;
  note?: string;
}

export interface MarkPaidInput {
  payment_reference?: string;
  paid_at?: string;
  note?: string;
}

export interface MarkShippedInput {
  /** Mandatory: the parcel is tracked to the consolidation warehouse with it. */
  supplier_tracking_number: string;
  shipped_at?: string;
  expected_at_cargo?: string | null;
  note?: string;
}

/* ----------------------------------------------------------------- labels */

export const PROCUREMENT_STATUS: Record<ProcurementStatus, [string, string]> = {
  pending_sourcing: ["bg-yellow-100 text-yellow-800", "Pending Sourcing"],
  supplier_selected: ["bg-blue-100 text-blue-800", "Supplier Selected"],
  paid: ["bg-green-100 text-green-800", "Paid"],
  supplier_shipped: ["bg-teal-100 text-teal-800", "Supplier Shipped"],
  supplier_cancelled: ["bg-red-100 text-red-800", "Supplier Canceled"],
  received_at_cargo: ["bg-purple-100 text-purple-800", "Received at Cargo"],
  cancelled: ["bg-gray-100 text-gray-600", "Cancelled"],
};

export const EXCEPTION_FLAGS: Record<Exclude<ExceptionFlag, "">, [string, string]> = {
  payment_issue: ["bg-red-100 text-red-800", "Payment Issue"],
  supplier_delay: ["bg-orange-100 text-orange-800", "Supplier Delay"],
  quality_concern: ["bg-yellow-100 text-yellow-800", "Quality Concern"],
  stock_unavailable: ["bg-red-100 text-red-800", "Stock Unavailable"],
  parcel_lost: ["bg-red-100 text-red-800", "Parcel Lost"],
};

/** Design origin filter: ISO code → label and badge colour. */
export const PROCUREMENT_ORIGINS: [string, string, string][] = [
  ["CN", "China", "bg-red-100 text-red-800"],
  ["US", "USA", "bg-indigo-100 text-indigo-800"],
  ["GB", "UK", "bg-blue-100 text-blue-800"],
  ["AE", "Dubai", "bg-amber-100 text-amber-800"],
  ["IN", "India", "bg-orange-100 text-orange-800"],
  ["TZ", "Tanzania", "bg-green-100 text-green-800"],
];

/* ---------------------------------------------------------------- service */

export const procurementApi = {
  list: (query: QueryParams, signal?: AbortSignal) =>
    api.get<Paginated<ProcurementOrder>>("procurement/orders", query, signal),
  get: (id: number) => api.get<ProcurementOrder>(`procurement/orders/${id}`),
  stats: () => api.get<ProcurementStats>("procurement/orders/stats"),
  operators: () => api.get<Operator[]>("procurement/orders/operators"),
  update: (id: number, data: ProcurementUpdate) => api.patch<ProcurementOrder>(`procurement/orders/${id}`, data),
  selectSupplier: (id: number, data: SelectSupplierInput) =>
    api.post<ProcurementOrder>(`procurement/orders/${id}/select-supplier`, data),
  markPaid: (id: number, data: MarkPaidInput) => api.post<ProcurementOrder>(`procurement/orders/${id}/mark-paid`, data),
  markShipped: (id: number, data: MarkShippedInput) =>
    api.post<ProcurementOrder>(`procurement/orders/${id}/mark-shipped`, data),
  cancelSupplier: (id: number, reason: string) =>
    api.post<ProcurementOrder>(`procurement/orders/${id}/cancel-supplier`, { reason }),
  history: (id: number) => api.get<HistoryEntry[]>(`procurement/orders/${id}/history`),
};

export const suppliersApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Supplier>>("procurement/suppliers", query, signal),
  create: (data: SupplierInput) => api.post<Supplier>("procurement/suppliers", data),
  update: (id: number, data: Partial<SupplierInput>) => api.patch<Supplier>(`procurement/suppliers/${id}`, data),
  remove: (id: number) => api.delete(`procurement/suppliers/${id}`),
};

export const procurementKeys = {
  all: ["procurement"] as const,
  list: (query: object) => ["procurement", "orders", "list", query] as const,
  one: (id: number) => ["procurement", "orders", "one", id] as const,
  history: (id: number) => ["procurement", "orders", "one", id, "history"] as const,
  stats: ["procurement", "orders", "stats"] as const,
  operators: ["procurement", "operators"] as const,
  suppliers: (query: object) => ["procurement", "suppliers", query] as const,
  suppliersAll: ["procurement", "suppliers"] as const,
};
