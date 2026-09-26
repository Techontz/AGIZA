import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";

/* ------------------------------------------------------------------ types */

export type ParcelStage = "waiting" | "ready" | "in_shipment" | "arrived" | "cancelled";
export type ParcelSource = "agiza_procured" | "client_purchased";
export type CargoType = "standard" | "electronic_battery" | "bulk" | "machinery" | "fragile";
export type WeightType = "estimated" | "exact";
export type MethodType = "air-cargo" | "sea" | "road";
export type ShipmentStatus =
  | "created"
  | "booked"
  | "loaded"
  | "export_cleared"
  | "shipping_to_destination"
  | "clearance"
  | "completed"
  | "cancelled";
export type ShipmentAlert = "" | "customs_hold" | "document_missing" | "carrier_delay";

export interface NamedRef {
  id: number;
  name: string;
}

export interface MethodRef {
  id: number;
  name: string;
  category: "air" | "sea" | "land" | "local";
  type: MethodType;
}

export interface OriginRef {
  iso2: string;
  name: string;
}

export interface WarehouseRef {
  id: number;
  name: string;
  code: string;
}

export interface Parcel {
  id: number;
  order: {
    id: number;
    reference: string;
    status: string;
    status_display: string;
    customer: string;
    payment_status: "unpaid" | "partial" | "fully_paid" | "installment";
  };
  origin: OriginRef;
  stage: ParcelStage;
  stage_display: string;
  source: ParcelSource;
  source_display: string;
  shipper: NamedRef | null;
  shipping_method: MethodRef | null;
  warehouse: WarehouseRef | null;
  destination: { id: number; name: string; label: string } | null;
  supplier_tracking_number: string;
  item_name: string;
  description: string;
  packages_quantity: number;
  estimated_arrival: string | null;
  cargo_type: CargoType;
  cargo_type_display: string;
  weight_kg: string | null;
  cbm: string | null;
  weight_type: WeightType;
  received_at: string | null;
  exception_flags: string[];
  image: string | null;
  shipment: { id: number; cargo_id: string; shipment_number: string } | null;
  updated_at: string;
}

export interface Milestone {
  key: string;
  label: string;
  status: "completed" | "pending";
  at: string | null;
  expected: string | null;
}

export interface ShipmentOrder {
  parcel_id: number;
  order_id: number;
  reference: string;
  customer: string;
  item_name: string;
  weight_kg: string | null;
  cbm: string | null;
  timeline: Milestone[];
}

export interface ShipmentDocument {
  id: number;
  name: string;
  notes: string;
  content_type: string;
  url: string;
  created_at: string;
}

export interface ShipmentEvent {
  id: number;
  kind: "status" | "update" | "parcel" | "alert";
  kind_display: string;
  from_status: string;
  to_status: string;
  to_status_display: string | null;
  description: string;
  location: string;
  occurred_at: string;
  created_by: { id: number; full_name: string } | null;
  created_at: string;
}

export interface Shipment {
  id: number;
  cargo_id: string;
  shipment_number: string;
  shipper: NamedRef;
  shipping_method: MethodRef;
  origin: OriginRef;
  origin_warehouse: WarehouseRef | null;
  destination: { id: number; name: string; label: string };
  status: ShipmentStatus;
  status_display: string;
  weight_kg: string;
  cbm: string;
  eta: string | null;
  departed_at: string | null;
  arrived_at: string | null;
  alert: ShipmentAlert;
  alert_display: string;
  master_tracking_number: string;
  notes: string;
  orders: ShipmentOrder[];
  documents: ShipmentDocument[];
  allowed_transitions: { value: ShipmentStatus; label: string }[];
  created_at: string;
  updated_at: string;
}

export interface ShippingStats {
  total: number;
  active: number;
  in_transit: number;
  alerts: number;
  ready: number;
  waiting: number;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  type: string;
  country: number;
  country_name: string;
  city: number | null;
  city_name: string | null;
  status: string;
}

export interface ReceiveInput {
  weight_kg: string;
  cbm?: string | null;
  weight_type: WeightType;
  packages_quantity?: number;
  warehouse?: number | null;
  cargo_type?: CargoType;
  shipper?: number | null;
  shipping_method?: number | null;
  destination_city?: number | null;
  note?: string;
}

export interface CreateShipmentInput {
  parcels: number[];
  shipper: number;
  shipping_method: number;
  destination_city: number;
  origin_warehouse?: number | null;
  eta?: string | null;
  master_tracking_number?: string;
  shipment_number?: string;
  notes?: string;
}

export interface UpdateShipmentInput {
  eta?: string | null;
  master_tracking_number?: string;
  notes?: string;
  alert?: ShipmentAlert;
  alert_note?: string;
}

export interface TransitionInput {
  status: ShipmentStatus;
  note?: string;
  location?: string;
  occurred_at?: string;
}

export interface TrackingUpdateInput {
  description: string;
  location?: string;
  occurred_at?: string;
}

/* ---------------------------------------------------------------- service */

const P = "shipping/parcels";
const S = "shipping/shipments";

export const shippingApi = {
  parcels: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Parcel>>(P, query, signal),
    update: (id: number, data: Partial<ReceiveInput> & Record<string, unknown>) => api.patch<Parcel>(`${P}/${id}`, data),
    receive: (id: number, data: ReceiveInput) => api.post<Parcel>(`${P}/${id}/receive`, data),
  },
  shipments: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Shipment>>(S, query, signal),
    get: (id: number) => api.get<Shipment>(`${S}/${id}`),
    stats: () => api.get<ShippingStats>(`${S}/stats`),
    create: (data: CreateShipmentInput) => api.post<Shipment>(S, data),
    update: (id: number, data: UpdateShipmentInput) => api.patch<Shipment>(`${S}/${id}`, data),
    addParcels: (id: number, parcels: number[]) => api.post<Shipment>(`${S}/${id}/add-parcels`, { parcels }),
    removeParcel: (id: number, parcel: number) => api.post<Shipment>(`${S}/${id}/remove-parcel`, { parcel }),
    transition: (id: number, data: TransitionInput) => api.post<Shipment>(`${S}/${id}/transition`, data),
    events: (id: number) => api.get<ShipmentEvent[]>(`${S}/${id}/events`),
    addEvent: (id: number, data: TrackingUpdateInput) => api.post<ShipmentEvent[]>(`${S}/${id}/events`, data),
    documents: (id: number) => api.get<ShipmentDocument[]>(`${S}/${id}/documents`),
    uploadDocument: (id: number, form: FormData) => api.post<ShipmentDocument[]>(`${S}/${id}/documents`, form),
  },
  /** Consolidation warehouses (origin hubs where parcels are received). */
  warehouses: (query?: QueryParams) =>
    api.get<Paginated<Warehouse>>("warehouses", { type: "consolidation", page_size: 100, ...query }).then((p) => p.results),
};

/** Query keys: invalidate `shippingKeys.all` after any change. */
export const shippingKeys = {
  all: ["shipping"] as const,
  stats: ["shipping", "stats"] as const,
  parcels: (query?: object) => ["shipping", "parcels", query ?? {}] as const,
  shipments: (query?: object) => ["shipping", "shipments", query ?? {}] as const,
  events: (id: number) => ["shipping", "shipment", id, "events"] as const,
  warehouses: ["shipping", "warehouses"] as const,
};
