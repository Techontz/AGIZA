import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { Assignee, PersonRef, Transition } from "./orders";

/* ------------------------------------------------------------------ types */

export type DeliveryStatus =
  | "pending"
  | "assigned_driver"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "rescheduled"
  | "returned"
  | "cancelled";

export type DeliveryType = "standard" | "express" | "same_day" | "inter_city";
export type DeliverySource = "international" | "shop" | "local_delivery";
export type DeliveryExceptionFlag = "customer_unavailable" | "payment_issue" | "address_unclear";

export interface DeliveryPhoto {
  id: number;
  url: string;
}

/**
 * Proof of delivery. When photos were attached without a proof record
 * (e.g. added later), only `photos` is present.
 */
export interface DeliveryProof {
  signature_name?: string;
  signature_url?: string | null;
  notes?: string;
  completed_at?: string;
  recorded_by?: PersonRef | null;
  photos: DeliveryPhoto[];
}

/** The driver carrying a delivery (phone so staff can call them). */
export interface DriverRef extends PersonRef {
  phone: string;
}

/** A line being delivered: shop lines carry SKU and bin; other orders have one line without them. */
export interface DeliveryItem {
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
  warehouse: string;
  bin_code: string;
}

export interface Delivery {
  id: number;
  reference: string;
  order: { id: number; reference: string; order_type: string; status: string; status_display: string };
  source: DeliverySource;
  source_display: string;
  customer: { id: number; full_name: string; phone: string };
  delivery_type: DeliveryType;
  delivery_type_display: string;
  status: DeliveryStatus;
  status_display: string;
  driver: DriverRef | null;
  scheduled_at: string | null;
  pickup_point: string;
  pickup_warehouse: { id: number; name: string } | null;
  delivery_address: string;
  destination_city: { id: number; name: string } | null;
  destination_area: string;
  recipient_name: string;
  recipient_phone: string;
  exception_flag: DeliveryExceptionFlag | "";
  exception_flag_display: string;
  attempts: number;
  notes: string;
  delivered_at: string | null;
  proof: DeliveryProof | null;
  items: DeliveryItem[];
  allowed_transitions: Transition[];
  created_at: string;
  updated_at: string;
}

/** One customer's deliveries shown together (GET deliveries/by-customer). */
export interface DeliveryGroup {
  customer: { id: number; full_name: string; phone: string };
  destination: string;
  count: number;
  statuses: { status: DeliveryStatus; status_display: string; count: number }[];
  drivers: DriverRef[];
  deliveries: Delivery[];
}

export interface DeliveryEvent {
  id: number;
  from_status: string;
  from_status_display: string | null;
  to_status: string;
  to_status_display: string | null;
  note: string;
  changed_by: PersonRef | null;
  created_at: string;
}

export interface DeliveryStats {
  pending: number;
  completed: number;
  out_for_delivery: number;
  delivered_today: number;
  failed_issues: number;
}

export interface DeliveryCreateInput {
  order: number;
  delivery_address: string;
  delivery_type: DeliveryType;
  destination_city?: number | null;
  destination_area?: string;
  pickup_point?: string;
  scheduled_at?: string | null;
  recipient_name?: string;
  recipient_phone?: string;
  notes?: string;
  driver?: number | null;
}

export interface DeliveryTransitionInput {
  status: DeliveryStatus;
  note?: string;
  exception_flag?: DeliveryExceptionFlag | "";
  scheduled_at?: string | null;
}

/** Collection leg of a marketplace order: a rider picks the items up from a seller and brings them to the hub. */
export type PickupStatus = "pending" | "ready" | "assigned" | "collected" | "at_hub" | "failed" | "cancelled";

export interface PickupEvent {
  from: string;
  to: string;
  note: string;
  at: string;
  by: string;
}

export interface PickupTask {
  id: number;
  reference: string;
  status: PickupStatus;
  status_display: string;
  order: { id: number; reference: string };
  vendor: { id: number; name: string } | null;
  origin: { id: number; name: string; address: string; phone: string; city: string };
  destination: { id: number; name: string; city: string };
  driver: { id: number; name: string } | null;
  scheduled_at: string | null;
  collected_at: string | null;
  arrived_at: string | null;
  handed_over_by: string;
  notes: string;
  created_at: string;
  events: PickupEvent[];
}

export interface PickupAdvanceInput {
  status: "collected" | "at_hub" | "failed";
  handed_over_by?: string;
  note?: string;
}

/* ---------------------------------------------------------------- service */

const base = "deliveries";

export const deliveriesApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Delivery>>(base, query, signal),
  /** Same filters as `list` (plus `customer`), one row per customer. */
  byCustomer: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<DeliveryGroup>>(`${base}/by-customer`, query, signal),
  get: (id: number) => api.get<Delivery>(`${base}/${id}`),
  stats: () => api.get<DeliveryStats>(`${base}/stats`),
  drivers: () => api.get<Assignee[]>(`${base}/drivers`),
  create: (data: DeliveryCreateInput) => api.post<Delivery>(base, data),
  update: (id: number, data: Partial<Omit<DeliveryCreateInput, "order" | "driver">>) =>
    api.patch<Delivery>(`${base}/${id}`, data),
  assignDriver: (id: number, data: { driver: number; scheduled_at?: string | null; note?: string }) =>
    api.post<Delivery>(`${base}/${id}/assign-driver`, data),
  /** One driver for several deliveries of the same customer. */
  bulkAssignDriver: (data: { deliveries: number[]; driver: number; scheduled_at?: string | null; note?: string }) =>
    api.post<Delivery[]>(`${base}/bulk-assign-driver`, data),
  /** Multipart: deliveries (repeated ids, one customer), signature_name, notes?, completed_at?, signature_image?, photos (max 6). */
  bulkComplete: (form: FormData) => api.post<Delivery[]>(`${base}/bulk-complete`, form),
  transition: (id: number, data: DeliveryTransitionInput) => api.post<Delivery>(`${base}/${id}/transition`, data),
  /** Multipart: signature_name, notes?, completed_at?, signature_image?, photos (repeated, max 6). */
  complete: (id: number, form: FormData) => api.post<Delivery>(`${base}/${id}/complete`, form),
  /** Multipart: photos (repeated), signature_name? (when no proof exists yet), notes?. */
  addProof: (id: number, form: FormData) => api.post<Delivery>(`${base}/${id}/proof`, form),
  events: (id: number) => api.get<DeliveryEvent[]>(`${base}/${id}/events`),

  pickups: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<PickupTask>>(`${base}/pickups`, query, signal),
    get: (id: number) => api.get<PickupTask>(`${base}/pickups/${id}`),
    assign: (id: number, data: { driver: number; scheduled_at?: string | null }) =>
      api.post<PickupTask>(`${base}/pickups/${id}/assign`, data),
    advance: (id: number, data: PickupAdvanceInput) => api.post<PickupTask>(`${base}/pickups/${id}/advance`, data),
  },
};

export const deliveryKeys = {
  all: ["deliveries"] as const,
  list: (query: object) => ["deliveries", "list", query] as const,
  groups: (query: object) => ["deliveries", "groups", query] as const,
  stats: ["deliveries", "stats"] as const,
  drivers: ["deliveries", "drivers"] as const,
  events: (id: number) => ["deliveries", "events", id] as const,
  pickups: (query: object) => ["deliveries", "pickups", query] as const,
};
