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
  driver: PersonRef | null;
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
  allowed_transitions: Transition[];
  created_at: string;
  updated_at: string;
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

/* ---------------------------------------------------------------- service */

const base = "deliveries";

export const deliveriesApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Delivery>>(base, query, signal),
  get: (id: number) => api.get<Delivery>(`${base}/${id}`),
  stats: () => api.get<DeliveryStats>(`${base}/stats`),
  drivers: () => api.get<Assignee[]>(`${base}/drivers`),
  create: (data: DeliveryCreateInput) => api.post<Delivery>(base, data),
  update: (id: number, data: Partial<Omit<DeliveryCreateInput, "order" | "driver">>) =>
    api.patch<Delivery>(`${base}/${id}`, data),
  assignDriver: (id: number, data: { driver: number; scheduled_at?: string | null; note?: string }) =>
    api.post<Delivery>(`${base}/${id}/assign-driver`, data),
  transition: (id: number, data: DeliveryTransitionInput) => api.post<Delivery>(`${base}/${id}/transition`, data),
  /** Multipart: signature_name, notes?, completed_at?, signature_image?, photos (repeated, max 6). */
  complete: (id: number, form: FormData) => api.post<Delivery>(`${base}/${id}/complete`, form),
  /** Multipart: photos (repeated), signature_name? (when no proof exists yet), notes?. */
  addProof: (id: number, form: FormData) => api.post<Delivery>(`${base}/${id}/proof`, form),
  events: (id: number) => api.get<DeliveryEvent[]>(`${base}/${id}/events`),
};

export const deliveryKeys = {
  all: ["deliveries"] as const,
  list: (query: object) => ["deliveries", "list", query] as const,
  stats: ["deliveries", "stats"] as const,
  drivers: ["deliveries", "drivers"] as const,
  events: (id: number) => ["deliveries", "events", id] as const,
};
