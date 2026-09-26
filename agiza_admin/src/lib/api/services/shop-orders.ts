import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { Assignee, HistoryEntry, OrderBase, Payment } from "./orders";

export type ShopStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
export type ShopChannel = "web" | "app" | "whatsapp" | "shop" | "manual";

export interface ShopOrderItem {
  id: number;
  product_id: number;
  variant: number;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  warehouse: number | null;
}

export interface ShopOrder extends Omit<OrderBase, "status"> {
  status: ShopStatus;
  items: ShopOrderItem[];
  details: {
    customer_email: string;
    shipping_address: string;
    city: { id: number; name: string } | null;
    area: string;
    full_address: string;
    channel: ShopChannel;
    channel_display: string;
    delivery_fee: string;
    subtotal: string;
    fulfillment_warehouse: string | null;
    shipped_at: string | null;
  };
  payment_status: "paid" | "pending";
  delivery: { id: number; reference: string; status: string; status_display: string } | null;
}

export interface ShopOrderStats {
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  revenue: string;
}

export interface ShopOrderInput {
  customer: number;
  items: { variant: number; quantity: number; unit_price?: string | null }[];
  shipping_address: string;
  city?: number | null;
  area?: string;
  customer_email?: string;
  channel: ShopChannel;
  delivery_fee: string;
  notes?: string;
}

const base = "orders/shop";

export const shopOrdersApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<ShopOrder>>(base, query, signal),
  get: (id: number) => api.get<ShopOrder>(`${base}/${id}`),
  stats: () => api.get<ShopOrderStats>(`${base}/stats`),
  create: (data: ShopOrderInput) => api.post<ShopOrder>(base, data),
  updateNotes: (id: number, notes: string) => api.patch<ShopOrder>(`${base}/${id}`, { notes }),
  transition: (id: number, status: string, note = "") => api.post<ShopOrder>(`${base}/${id}/transition`, { status, note }),
  ship: (id: number, data: { driver?: number | null; scheduled_at?: string | null; note?: string }) =>
    api.post<ShopOrder>(`${base}/${id}/ship`, data),
  cancel: (id: number, reason: string) => api.post<ShopOrder>(`${base}/${id}/cancel`, { reason }),
  history: (id: number) => api.get<HistoryEntry[]>(`${base}/${id}/history`),
  payments: (id: number) => api.get<Payment[]>(`${base}/${id}/payments`),
  recordPayment: (id: number, data: Record<string, unknown>) => api.post<Payment[]>(`${base}/${id}/payments`, data),
  /** Active drivers (through the orders module, so Deliveries access isn't needed). */
  drivers: () => api.get<Assignee[]>(`${base}/assignees`, { role: "driver" }),
};

export const shopOrderKeys = {
  /** Shared with every order screen, so a workflow change refreshes the "orders" tree. */
  all: ["orders", "shop"] as const,
  list: (query: object) => ["orders", "shop", "list", query] as const,
  stats: ["orders", "shop", "stats"] as const,
  sub: (id: number, what: string) => ["orders", "shop", "one", id, what] as const,
  drivers: ["orders", "shop", "drivers"] as const,
};
