import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { PersonRef } from "./orders";

/* ------------------------------------------------------------ locations */

export type WarehouseType = "consolidation" | "fulfillment" | "pickup_point" | "shop";
export type WarehouseStatus = "active" | "inactive" | "full";

export interface WarehouseLocation {
  id: number;
  code: string;
  name: string;
  type: WarehouseType;
  type_display: string;
  country: number;
  country_name: string;
  city: number;
  city_name: string;
  address: string;
  contact_person: string;
  phone: string;
  email: string;
  capacity_percent: number;
  status: WarehouseStatus;
  status_display: string;
  last_audit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarehouseInput {
  name: string;
  type: WarehouseType;
  country?: number;
  city: number;
  address: string;
  contact_person: string;
  phone: string;
  email: string;
  capacity_percent: number;
  status: WarehouseStatus;
  last_audit_at: string | null;
}

export interface WarehouseStats {
  total: number;
  pending_audits: number;
  consolidation: number;
  fulfillment: number;
  pickup_point: number;
  shop: number;
}

/* ------------------------------------------------------------ inventory */

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "reserved" | "listed" | "hidden";

export interface StockItem {
  id: number;
  sku: string;
  product: { id: number; variant_id: number; name: string };
  category: string;
  warehouse: { id: number; code: string; name: string; type: WarehouseType; city: string };
  bin_code: string;
  quantity: number;
  reserved: number;
  available: number;
  status: StockStatus;
  status_display: string;
  origin: string | null;
  listed: boolean;
  shop_price: string | null;
  /** Shop price when set, else the variant's price. */
  price: string;
  updated_at: string;
}

export interface StockStats {
  total_skus: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  reserved: number;
  shop_items: number;
}

export interface StockMovement {
  id: number;
  kind: string;
  kind_display: string;
  quantity_change: number;
  reserved_change: number;
  quantity_after: number;
  reserved_after: number;
  order: string | null;
  note: string;
  created_by: PersonRef | null;
  created_at: string;
}

export interface VariantOption {
  id: number;
  sku: string;
  name: string;
  price: string;
  available: number;
}

/* -------------------------------------------------------------- service */

export const warehouseApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<WarehouseLocation>>("warehouses", query, signal),
  /** Every location (for pickers), up to the API's page-size cap. */
  all: (query?: QueryParams) =>
    api.get<Paginated<WarehouseLocation>>("warehouses", { page_size: 100, ...query }).then((p) => p.results),
  stats: () => api.get<WarehouseStats>("warehouses/stats"),
  create: (data: WarehouseInput) => api.post<WarehouseLocation>("warehouses", data),
  update: (id: number, data: Partial<WarehouseInput>) => api.patch<WarehouseLocation>(`warehouses/${id}`, data),
  remove: (id: number) => api.delete(`warehouses/${id}`),
};

export const inventoryApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<StockItem>>("inventory/stock", query, signal),
  stats: () => api.get<StockStats>("inventory/stock/stats"),
  update: (id: number, data: { bin_code?: string; listed?: boolean; shop_price?: string | null }) =>
    api.patch<StockItem>(`inventory/stock/${id}`, data),
  receive: (data: { variant: number; warehouse: number; quantity: number; bin_code?: string; note?: string }) =>
    api.post<StockItem>("inventory/stock/receive", data),
  adjust: (id: number, data: { new_quantity: number; reason: string }) =>
    api.post<StockItem>(`inventory/stock/${id}/adjust`, data),
  transfer: (id: number, data: { to_warehouse: number; quantity: number; bin_code?: string }) =>
    api.post<StockItem>(`inventory/stock/${id}/transfer`, data),
  movements: (id: number) => api.get<StockMovement[]>(`inventory/stock/${id}/movements`),
  /** Sellable variants with total available stock (catalogue search). */
  variants: (search: string) => api.get<VariantOption[]>("catalog/products/variants", { search }),
};

export const warehouseKeys = {
  all: ["warehouses"] as const,
  list: (query: object) => ["warehouses", "list", query] as const,
  options: ["warehouses", "options"] as const,
  stats: ["warehouses", "stats"] as const,
};

export const inventoryKeys = {
  all: ["inventory"] as const,
  list: (query: object) => ["inventory", "list", query] as const,
  stats: ["inventory", "stats"] as const,
  movements: (id: number) => ["inventory", "movements", id] as const,
  variants: (search: string) => ["inventory", "variants", search] as const,
};
