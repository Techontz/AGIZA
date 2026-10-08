import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { Assignee, HistoryEntry, OrderBase, Payment } from "./orders";

export type ShopStatus =
  | "pending"
  | "processing"
  // Imported items travel from abroad before the last-mile delivery.
  | "ordered_from_supplier"
  | "at_origin_warehouse"
  | "shipping_to_destination"
  | "clearance"
  | "arrived"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Status filter options, in workflow order (the import stages apply to orders with items from abroad). */
export const SHOP_STATUS_OPTIONS: [ShopStatus, string][] = [
  ["pending", "Pending"],
  ["processing", "Processing"],
  ["ordered_from_supplier", "Ordered from Supplier"],
  ["at_origin_warehouse", "At Warehouse Abroad"],
  ["shipping_to_destination", "Shipping to Tanzania"],
  ["clearance", "Customs Clearance"],
  ["arrived", "Arrived in Tanzania"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
];
export const SHOP_IMPORT_STAGES: ShopStatus[] = ["ordered_from_supplier", "at_origin_warehouse", "shipping_to_destination", "clearance", "arrived"];
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
  /** Name of the location the line's stock is reserved at. */
  warehouse: string | null;
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
    /** Chosen by the customer at checkout (app / online store); empty for staff-entered orders. */
    shipping_method: { id: number; name: string } | null;
    estimated_delivery: string;
    payment_preference: "" | "pay_later" | "mobile_money";
    payment_preference_display: string;
    location: { latitude: string; longitude: string } | null;
    /** Imported items: paid in full before AGIZA buys them, by payment_due_at. */
    prepayment_required?: boolean;
    payment_due_at?: string | null;
    /** The Shipping Engine needed a manual quote: staff must set the delivery cost before the customer can pay. */
    delivery_fee_pending: boolean;
    /** Why the cost must be set by hand: what the Shipping Engine is missing for this address. */
    delivery_issue?: string;
  };
  payment_status: "paid" | "pending";
  delivery: { id: number; reference: string; status: string; status_display: string } | null;
}

export interface ShopOrderStats {
  pending: number;
  processing: number;
  /** In one of the import stages (coming from abroad). */
  importing?: number;
  shipped: number;
  delivered: number;
  /** Live orders waiting for staff to set their delivery cost. */
  delivery_fee_pending: number;
  revenue: string;
}

export interface DeliveryFeeInput {
  /** Delivery to the customer's address (any import shipping already charged stays). */
  delivery_fee: string;
  shipping_method?: number | null;
  estimated_delivery?: string;
  note?: string;
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
  /** Set the delivery cost of an order placed while it needed a manual quote; the customer is told to pay. */
  setDeliveryFee: (id: number, data: DeliveryFeeInput) => api.post<ShopOrder>(`${base}/${id}/delivery-fee`, data),
  methods: () =>
    api
      .get<Paginated<{ id: number; name: string; status: string }>>("shipping-engine/methods", { page_size: 100 })
      .then((p) => p.results.filter((m) => m.status === "active")),
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
  methods: ["orders", "shop", "methods"] as const,
};
