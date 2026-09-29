import { api } from "../client";
import type { Paginated } from "../types";

/* ------------------------------------------------------------------ types */

export type CatalogStatus = "active" | "inactive";

export interface Category {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  parent_name: string | null;
  description: string;
  sort_order: number;
  is_active: boolean;
  products_count: number;
  created_at: string;
  updated_at: string;
}
export interface CategoryInput {
  name: string;
  parent: number | null;
  description: string;
  is_active: boolean;
}

export interface Brand {
  id: number;
  reference: string;
  name: string;
  country: string;
  description: string;
  status: CatalogStatus;
  logo_url: string | null;
  products_count: number;
  created_at: string;
  updated_at: string;
}
export interface BrandInput {
  name: string;
  country: string;
  description: string;
  status: CatalogStatus;
}

export type LabelColor = "blue" | "red" | "yellow" | "purple" | "orange" | "green" | "gray";
export interface Label {
  id: number;
  reference: string;
  name: string;
  color: LabelColor;
  visible: boolean;
  products_count: number;
  created_at: string;
  updated_at: string;
}
export interface LabelInput {
  name: string;
  color: LabelColor;
  visible: boolean;
}

export type OptionType = "size" | "color" | "bundle" | "storage" | "text";
export interface OptionValue {
  id: number;
  value: string;
  sort_order: number;
}
export interface ProductOption {
  id: number;
  reference: string;
  name: string;
  type: OptionType;
  status: CatalogStatus;
  values: OptionValue[];
  created_at: string;
  updated_at: string;
}
export interface OptionInput {
  name: string;
  type: OptionType;
  status: CatalogStatus;
}

export type ProfitType = "fixed" | "percent";
export type ProfitScope = "all" | "per_product";
export type CommissionMode = "default" | "custom";
export type ApprovalStatus = "pending" | "under_review" | "changes_requested" | "approved" | "rejected" | "suspended";
export interface Vendor {
  id: number;
  reference: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  status: CatalogStatus;
  verified: boolean;
  profit_type: ProfitType;
  profit_value: string;
  profit_scope: ProfitScope;
  joined_date: string | null;
  notes: string;
  /** Computed by the backend. */
  products_count: number;
  /** Computed by the backend (non-cancelled order lines). */
  total_sales: string;
  created_at: string;
  updated_at: string;
  /* ---- marketplace ---- */
  slug: string;
  commission_mode: CommissionMode;
  rating: string | null;
  orders_count: number;
  /** Products of this vendor waiting for review. */
  pending_products: number;
  approval_status: ApprovalStatus;
  approval_status_display: string;
  /** True for stores run by their owner through the seller app. */
  self_service: boolean;
  owner: { customer_id: number; name: string; phone: string; reference: string } | null;
  description: string;
  city: number | null;
  city_name: string | null;
  business_type: "individual" | "company" | "";
  legal_name: string;
  registration_number: string;
  tin: string;
  business_address: string;
  contact_person: string;
  payout_method: "mobile_money" | "bank" | "";
  payout_provider: string;
  payout_account_name: string;
  payout_account_number: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string;
  /** API paths of the store images (use `fileSrc`). */
  logo_url: string | null;
  banner_url: string | null;
  warehouse: { id: number; code: string; name: string; status: string } | null;
}

export type VendorCounts = Record<ApprovalStatus | "all", number>;

export interface VendorHistoryEntry {
  from_status: string;
  to_status: ApprovalStatus;
  to_status_display: string;
  note: string;
  by: string;
  at: string;
}

export interface VendorListQuery {
  search?: string;
  approval_status?: string;
  self_service?: string;
  page?: number;
  page_size?: number;
}

export interface VendorInput {
  name: string;
  email: string;
  phone: string;
  location: string;
  status: CatalogStatus;
  verified: boolean;
  profit_type: ProfitType;
  profit_value: string;
  profit_scope: ProfitScope;
  joined_date: string | null;
  notes: string;
}
export type ProfitAgreementInput = Pick<VendorInput, "profit_type" | "profit_value" | "profit_scope"> & {
  commission_mode: CommissionMode;
};

export interface StoreSettings {
  store_name: string;
  description: string;
  location: number | null;
  location_name: string | null;
  currency: string;
  same_city_min_days: number;
  same_city_max_days: number;
  regional_min_days: number;
  regional_max_days: number;
  guest_checkout: boolean;
  product_reviews: boolean;
  updated_at: string;
}
export type StoreSettingsInput = Partial<Omit<StoreSettings, "location_name" | "updated_at">>;

export interface EstimateRoute {
  id: number;
  from_city: number;
  from_city_name: string;
  to_city: number;
  to_city_name: string;
  min_days: number;
  max_days: number;
}
export interface EstimateRouteInput {
  from_city: number;
  to_city: number;
  min_days: number;
  max_days: number;
}

export type ShipMethod = "air" | "sea";
export interface OriginEstimate {
  id: number;
  country: number;
  country_name: string;
  method: ShipMethod;
  min_days: number;
  max_days: number;
}
export interface OriginEstimateInput {
  country: number;
  method: ShipMethod;
  min_days: number;
  max_days: number;
}

export interface ProductStats {
  total: number;
  active: number;
  out_of_stock: number;
  inventory_value: string;
}

/* ------------------------------------------------------------------ keys */

export const catalogKeys = {
  all: ["catalog"] as const,
  productStats: ["catalog", "products", "stats"] as const,
  categories: ["catalog", "categories"] as const,
  brands: ["catalog", "brands"] as const,
  labels: ["catalog", "labels"] as const,
  options: ["catalog", "options"] as const,
  vendors: ["catalog", "vendors"] as const,
  vendorList: (query: object) => ["catalog", "vendors", query] as const,
  vendorCounts: ["catalog", "vendors", "counts"] as const,
  vendor: (id: number) => ["catalog", "vendors", "detail", id] as const,
  vendorHistory: (id: number) => ["catalog", "vendors", "history", id] as const,
  settings: ["catalog", "settings"] as const,
  estimateRoutes: ["catalog", "estimate-routes"] as const,
  originEstimates: ["catalog", "origin-estimates"] as const,
};

/* ------------------------------------------------------------------ api */

export const catalogApi = {
  productStats: () => api.get<ProductStats>("catalog/products/stats"),

  categories: {
    list: (signal?: AbortSignal) => api.get<Category[]>("catalog/categories", undefined, signal),
    create: (body: CategoryInput) => api.post<Category>("catalog/categories", body),
    update: (id: number, body: Partial<CategoryInput>) => api.patch<Category>(`catalog/categories/${id}`, body),
    remove: (id: number) => api.delete(`catalog/categories/${id}`),
  },

  brands: {
    list: (signal?: AbortSignal) => api.get<Brand[]>("catalog/brands", undefined, signal),
    create: (body: BrandInput) => api.post<Brand>("catalog/brands", body),
    update: (id: number, body: Partial<BrandInput>) => api.patch<Brand>(`catalog/brands/${id}`, body),
    remove: (id: number) => api.delete(`catalog/brands/${id}`),
    uploadLogo: (id: number, file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<Brand>(`catalog/brands/${id}/logo`, form);
    },
  },

  labels: {
    list: (signal?: AbortSignal) => api.get<Label[]>("catalog/labels", undefined, signal),
    create: (body: LabelInput) => api.post<Label>("catalog/labels", body),
    update: (id: number, body: Partial<LabelInput>) => api.patch<Label>(`catalog/labels/${id}`, body),
    remove: (id: number) => api.delete(`catalog/labels/${id}`),
  },

  options: {
    list: (signal?: AbortSignal) => api.get<ProductOption[]>("catalog/options", undefined, signal),
    create: (body: OptionInput) => api.post<ProductOption>("catalog/options", body),
    update: (id: number, body: Partial<OptionInput>) => api.patch<ProductOption>(`catalog/options/${id}`, body),
    remove: (id: number) => api.delete(`catalog/options/${id}`),
    addValue: (id: number, value: string) => api.post<ProductOption>(`catalog/options/${id}/values`, { value }),
    removeValue: (id: number, valueId: number) =>
      api.delete<ProductOption>(`catalog/options/${id}/values/${valueId}`),
  },

  vendors: {
    list: (query: VendorListQuery, signal?: AbortSignal) =>
      api.get<Paginated<Vendor>>("catalog/vendors", { ...query }, signal),
    get: (id: number, signal?: AbortSignal) => api.get<Vendor>(`catalog/vendors/${id}`, undefined, signal),
    counts: (signal?: AbortSignal) => api.get<VendorCounts>("catalog/vendors/counts", undefined, signal),
    history: (id: number, signal?: AbortSignal) =>
      api.get<VendorHistoryEntry[]>(`catalog/vendors/${id}/history`, undefined, signal),
    create: (body: VendorInput) => api.post<Vendor>("catalog/vendors", body),
    update: (id: number, body: Partial<VendorInput> & { commission_mode?: CommissionMode; city?: number | null }) =>
      api.patch<Vendor>(`catalog/vendors/${id}`, body),
    remove: (id: number) => api.delete(`catalog/vendors/${id}`),
    /** Application review / account status: `note` is required for rejected, changes_requested, suspended. */
    review: (id: number, body: { status: ApprovalStatus; note: string }) =>
      api.post<Vendor>(`catalog/vendors/${id}/review`, body),
    uploadMedia: (id: number, kind: "logo" | "banner", file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<Vendor>(`catalog/vendors/${id}/media/${kind}`, form);
    },
  },

  settings: {
    get: (signal?: AbortSignal) => api.get<StoreSettings>("catalog/settings", undefined, signal),
    update: (body: StoreSettingsInput) => api.patch<StoreSettings>("catalog/settings", body),
  },

  estimateRoutes: {
    list: (signal?: AbortSignal) => api.get<EstimateRoute[]>("catalog/estimate-routes", undefined, signal),
    create: (body: EstimateRouteInput) => api.post<EstimateRoute>("catalog/estimate-routes", body),
    update: (id: number, body: EstimateRouteInput) => api.patch<EstimateRoute>(`catalog/estimate-routes/${id}`, body),
    remove: (id: number) => api.delete(`catalog/estimate-routes/${id}`),
  },

  originEstimates: {
    list: (signal?: AbortSignal) => api.get<OriginEstimate[]>("catalog/origin-estimates", undefined, signal),
    create: (body: OriginEstimateInput) => api.post<OriginEstimate>("catalog/origin-estimates", body),
    update: (id: number, body: OriginEstimateInput) =>
      api.patch<OriginEstimate>(`catalog/origin-estimates/${id}`, body),
    remove: (id: number) => api.delete(`catalog/origin-estimates/${id}`),
  },
};
