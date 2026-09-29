import { api, type QueryParams } from "../client";
import type { Paginated, StaffLevel } from "../types";
import type { Vendor } from "./catalog";

/* ------------------------------------------------------------------ types */

export type PersonRole = "customer" | "staff" | "shipper" | "shop_vendor" | "service_provider" | "driver";
export type ActiveStatus = "active" | "inactive";

/** GET people/stats/: counts for the six tabs. */
export type PeopleStats = Record<PersonRole, number>;

export interface CustomerTagChip {
  id: number;
  name: string;
  type: "system" | "manual";
  created_at: string;
}

export type PreferredChannel = "" | "whatsapp" | "facebook" | "tiktok" | "web" | "phone" | "walk_in" | "app";

export interface Customer {
  id: number;
  reference: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  status: ActiveStatus;
  status_display: string;
  preferred_channel: PreferredChannel;
  notes: string;
  tags: CustomerTagChip[];
  total_orders: number | null;
  total_spent: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface CustomerInput {
  full_name: string;
  phone: string;
  email: string;
  company_name: string;
  preferred_channel: PreferredChannel;
  notes: string;
  status?: ActiveStatus;
}

export interface CrmTag {
  id: number;
  name: string;
  customers: number;
}

export type Department = "management" | "sales" | "procurement" | "shipping" | "delivery" | "finance" | "support" | "warehouse";

export interface StaffMember {
  id: number;
  employee_id: string;
  email: string;
  full_name: string;
  phone: string;
  staff_level: StaffLevel;
  staff_level_display: string;
  department: Department;
  department_display: string;
  is_active: boolean;
  last_login: string | null;
  date_joined: string;
  /** Deliveries assigned (drivers). */
  total_orders: number | null;
}
export interface StaffInput {
  email: string;
  full_name: string;
  phone: string;
  staff_level: StaffLevel;
  department: Department;
  password?: string;
  is_active?: boolean;
}

export type ShipperService = "air_cargo" | "sea_cargo" | "local_land_cargo";

/** A Shipping Engine carrier as shown in People → Shippers. */
export interface Shipper {
  id: number;
  name: string;
  type: string;
  type_display: string;
  contact_email: string;
  contact_phone: string;
  origins: number[];
  origin_names: string[];
  services: ShipperService[];
  warehouses: number[];
  warehouse_names: { id: number; code: string; name: string }[];
  rating: string | null;
  total_orders: number;
  notes: string;
  status: ActiveStatus;
  status_display: string;
  created_at: string;
  updated_at: string;
}
export interface ShipperInput {
  name: string;
  type: string;
  contact_email: string;
  contact_phone: string;
  status: ActiveStatus;
  services: ShipperService[];
  origins: number[];
  warehouses: number[];
  rating: string | null;
  notes: string;
}

/** Catalogue vendor with the counts the People table needs. */
export type ShopVendor = Vendor & { orders_count: number; rating: string | null };

export interface ServiceProvider {
  id: number;
  reference: string;
  name: string;
  email: string;
  phone: string;
  services: string;
  city: number | null;
  city_name: string | null;
  address: string;
  status: ActiveStatus;
  rating: string | null;
  notes: string;
  total_orders: number;
  created_at: string;
  updated_at: string;
}
export interface ServiceProviderInput {
  name: string;
  email: string;
  phone: string;
  services: string;
  city: number | null;
  address: string;
  status: ActiveStatus;
  rating: string | null;
  notes: string;
}

/** Consolidation warehouse offered for linking to a shipper. */
export interface ConsolidationWarehouse {
  id: number;
  code: string;
  name: string;
  country_name: string;
  city_name: string;
  address: string;
  status: string;
}

/* -------------------------------------------------------------- constants */

export const STAFF_LEVEL_OPTIONS: { value: StaffLevel; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "finance", label: "Finance" },
  { value: "procurement", label: "Procurement" },
  { value: "data_entry", label: "Data Entry" },
  { value: "admin_l1", label: "Admin Level 1" },
  { value: "admin_l2", label: "Admin Level 2" },
  { value: "top_admin", label: "Top Admin" },
];

export const DEPARTMENT_OPTIONS: { value: Department; label: string }[] = [
  { value: "management", label: "Management" },
  { value: "sales", label: "Sales" },
  { value: "procurement", label: "Procurement" },
  { value: "shipping", label: "Shipping" },
  { value: "delivery", label: "Delivery" },
  { value: "finance", label: "Finance" },
  { value: "support", label: "Support" },
  { value: "warehouse", label: "Warehouse" },
];

export const CHANNEL_OPTIONS: { value: Exclude<PreferredChannel, "">; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "web", label: "Web" },
  { value: "phone", label: "Phone" },
  { value: "walk_in", label: "Walk-in" },
  { value: "app", label: "Mobile app" },
];

export const SHIPPER_SERVICES: ShipperService[] = ["air_cargo", "sea_cargo", "local_land_cargo"];

/* ------------------------------------------------------------------ api */

export const peopleApi = {
  stats: () => api.get<PeopleStats>("people/stats"),
  tags: () => api.get<CrmTag[]>("crm/tags"),

  customers: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Customer>>("customers", query, signal),
    create: (body: CustomerInput) => api.post<Customer>("customers", body),
    update: (id: number, body: Partial<CustomerInput>) => api.patch<Customer>(`customers/${id}`, body),
  },

  /** Staff accounts; `role: "driver"` lists drivers, `role: "staff"` everyone else. */
  staff: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<StaffMember>>("staff", query, signal),
    create: (body: StaffInput) => api.post<StaffMember>("staff", body),
    update: (id: number, body: Partial<StaffInput>) => api.patch<StaffMember>(`staff/${id}`, body),
  },

  shippers: {
    list: (query: QueryParams, signal?: AbortSignal) =>
      api.get<Paginated<Shipper>>("shipping-engine/carriers", query, signal),
    create: (body: ShipperInput) => api.post<Shipper>("shipping-engine/carriers", body),
    update: (id: number, body: Partial<ShipperInput>) => api.patch<Shipper>(`shipping-engine/carriers/${id}`, body),
  },

  vendors: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<ShopVendor>>("catalog/vendors", query, signal),
  },

  serviceProviders: {
    list: (query: QueryParams, signal?: AbortSignal) =>
      api.get<Paginated<ServiceProvider>>("service-providers", query, signal),
    create: (body: ServiceProviderInput) => api.post<ServiceProvider>("service-providers", body),
    update: (id: number, body: Partial<ServiceProviderInput>) =>
      api.patch<ServiceProvider>(`service-providers/${id}`, body),
    remove: (id: number) => api.delete(`service-providers/${id}`),
  },

  consolidationWarehouses: () =>
    api
      .get<Paginated<ConsolidationWarehouse>>("warehouses", { type: "consolidation", page_size: 100 })
      .then((p) => p.results),
};

export const peopleKeys = {
  all: ["people"] as const,
  stats: ["people", "stats"] as const,
  tags: ["people", "tags"] as const,
  lists: ["people", "list"] as const,
  list: (role: PersonRole, query: object) => ["people", "list", role, query] as const,
  warehouses: ["people", "consolidation-warehouses"] as const,
};
