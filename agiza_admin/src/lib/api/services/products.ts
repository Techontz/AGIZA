/**
 * E-commerce products (catalog/products) plus the reference lists the
 * product editor needs. Every shape mirrors backend/apps/catalog/serializers.py.
 */
import { api, type QueryParams } from "../client";
import type { City, Country, Paginated } from "../types";

/* ------------------------------------------------------------------ enums */

export type ProductStatus = "active" | "draft" | "hidden" | "out_of_stock" | "inactive";
export type Condition = "new" | "used" | "refurbished" | "open_box";
export type TaxCategory = "standard" | "zero" | "exempt" | "special";
export type LocationKind = "warehouse" | "vendor" | "transit";
export type StockOverride = "" | "in_stock" | "reserved" | "in_transit";
export type VariantStatus = "active" | "inactive" | "out_of_stock";
export type ProfitType = "fixed" | "percent";
export type LabelColor = "blue" | "red" | "yellow" | "purple" | "orange" | "green" | "gray";

export const PRODUCT_STATUSES: { value: ProductStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "hidden", label: "Hidden" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "inactive", label: "Inactive" },
];

export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "new", label: "New" },
  { value: "used", label: "Used" },
  { value: "refurbished", label: "Refurbished" },
  { value: "open_box", label: "Open Box" },
];

export const TAX_CATEGORIES: { value: TaxCategory; label: string }[] = [
  { value: "standard", label: "Standard Rate (VAT 18%)" },
  { value: "zero", label: "Zero Rated" },
  { value: "exempt", label: "Exempt" },
  { value: "special", label: "Special Goods" },
];

export const STOCK_OVERRIDES: { value: StockOverride; label: string }[] = [
  { value: "", label: "Auto (from stock qty)" },
  { value: "in_stock", label: "In Stock" },
  { value: "reserved", label: "Reserved" },
  { value: "in_transit", label: "In Transit" },
];

export const VARIANT_STATUSES: { value: VariantStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "out_of_stock", label: "Out of Stock" },
];

/* ------------------------------------------------------------------ types */

export interface Ref {
  id: number;
  name: string;
}

export interface ProductLabelRef {
  id: number;
  name: string;
  color: LabelColor;
}

export type ReviewStatus = "not_required" | "pending" | "approved" | "rejected" | "disabled";
export type ModerationAction = "approve" | "reject" | "disable";

/** Who sells the product: AGIZA itself (`id: null`) or a vendor. */
export interface ProductSeller {
  id: number | null;
  name: string;
  slug: string;
  self_service: boolean;
}

export interface ProductRow {
  id: number;
  reference: string;
  name: string;
  sku: string;
  brand: Ref | null;
  category: Ref;
  status: ProductStatus;
  status_display: string;
  price: string;
  compare_at_price: string | null;
  description: string;
  origin: string | null;
  /** API path of the primary image (use `fileSrc`). */
  image: string | null;
  /** Available units (on hand − reserved) over active variants. */
  stock: number;
  low_stock_threshold: number;
  labels: ProductLabelRef[];
  has_variations: boolean;
  variants_count: number;
  featured: boolean;
  updated_at: string;
  seller: ProductSeller;
  review_status: ReviewStatus;
  review_status_display: string;
  review_note: string;
}

export interface ProductImage {
  id: number;
  url: string;
  is_primary: boolean;
  /** Variant id for a variation image, null for a product image. */
  variant: number | null;
}

export interface ProductVariant {
  id: number;
  name: string;
  sku: string;
  is_default: boolean;
  price: string | null;
  compare_at_price: string | null;
  purchase_cost: string | null;
  weight_kg: string | null;
  length_cm: string | null;
  width_cm: string | null;
  height_cm: string | null;
  status: VariantStatus;
  notes: string;
  option_values: { id: number; option: string; value: string }[];
  stock: number;
  images: { id: number; url: string }[];
}

export interface ProductRelationRef {
  id: number;
  name: string;
  sku: string;
}

export interface ProductDetail extends ProductRow {
  subcategory: Ref | null;
  condition: Condition;
  condition_description: string;
  purchase_cost: string | null;
  pata_bei: boolean;
  location_kind: LocationKind;
  location: { id: number; code: string; name: string; city: string; country: string } | null;
  bin_code: string;
  stock_override: StockOverride;
  origin_country: number | null;
  shipping_profile: { id: number; name: string; handling: string[] } | null;
  weight_kg: string | null;
  length_cm: string | null;
  width_cm: string | null;
  height_cm: string | null;
  packages: number;
  cbm: string | null;
  volumetric_kg: string | null;
  shipping_methods: number[];
  ready_to_ship_days: number;
  shipping_notes: string;
  variation_options: number[];
  variants: ProductVariant[];
  specifications: { name: string; value: string }[];
  vendor: { id: number; name: string; verified: boolean } | null;
  vendor_sku: string;
  vendor_location: string;
  vendor_profit_type: ProfitType | "";
  vendor_profit_value: string | null;
  ofa_kali: boolean;
  allow_save: boolean;
  allow_chat: boolean;
  keywords: string;
  gift_eligible: boolean;
  relations: {
    related_products: ProductRelationRef[];
    bought_together: ProductRelationRef[];
    gifts: ProductRelationRef[];
  };
  tax_category: TaxCategory;
  vat_applicable: boolean;
  images: ProductImage[];
  /** On-hand stock at the product location (simple products only). */
  location_stock: number | null;
  created_at: string;
}

export interface VariantWrite {
  id?: number;
  name: string;
  sku: string;
  price?: string | null;
  compare_at_price?: string | null;
  weight_kg?: string | null;
  length_cm?: string | null;
  width_cm?: string | null;
  height_cm?: string | null;
  status: VariantStatus;
  notes?: string;
  option_values?: number[];
  /** On-hand quantity at the product location (omit to leave stock untouched). */
  stock?: number | null;
}

/** Body of POST / PATCH catalog/products (ProductWriteSerializer). */
export interface ProductWrite {
  name: string;
  sku: string;
  brand: number | null;
  category: number | null;
  subcategory: number | null;
  status: ProductStatus;
  condition: Condition;
  condition_description: string;
  price: string;
  compare_at_price: string | null;
  stock?: number | null;
  low_stock_threshold: number;
  pata_bei: boolean;
  location_kind: LocationKind;
  location: number | null;
  bin_code: string;
  stock_override: StockOverride;
  origin_country: number | null;
  shipping_profile: number | null;
  weight_kg: string | null;
  length_cm: string | null;
  width_cm: string | null;
  height_cm: string | null;
  packages: number;
  shipping_methods: number[];
  ready_to_ship_days: number;
  shipping_notes: string;
  has_variations: boolean;
  variation_options: number[];
  variants?: VariantWrite[];
  description: string;
  specifications: { name: string; value: string }[];
  vendor: number | null;
  vendor_sku: string;
  vendor_location: string;
  vendor_profit_type: ProfitType | "";
  vendor_profit_value: string | null;
  featured: boolean;
  ofa_kali: boolean;
  allow_save: boolean;
  allow_chat: boolean;
  keywords: string;
  labels: number[];
  related_products: number[];
  bought_together: number[];
  gift_eligible: boolean;
  gifts: number[];
  tax_category: TaxCategory;
  vat_applicable: boolean;
}

export interface ProductStats {
  total: number;
  active: number;
  out_of_stock: number;
  inventory_value: string;
}

/* ------------------------------------------------------------ lookups */

export interface CategoryOption {
  id: number;
  name: string;
  parent: number | null;
  parent_name: string | null;
  is_active: boolean;
}

export interface BrandOption {
  id: number;
  name: string;
  status: "active" | "inactive";
}

export interface LabelOption {
  id: number;
  name: string;
  color: LabelColor;
  visible: boolean;
}

export interface OptionSet {
  id: number;
  name: string;
  type: string;
  status: "active" | "inactive";
  values: { id: number; value: string; sort_order: number }[];
}

export interface VendorOption {
  id: number;
  name: string;
  location: string;
  status: "active" | "inactive";
  verified: boolean;
  profit_type: ProfitType;
  profit_value: string;
  profit_scope: "all" | "per_product";
}

export interface ProfileOption {
  id: number;
  name: string;
  handling: string[];
  handling_display: string[];
  status: "active" | "inactive";
}

export interface MethodOption {
  id: number;
  name: string;
  code: string;
  category: "air" | "sea" | "land" | "local";
  status: "active" | "inactive";
}

export interface WarehouseOption {
  id: number;
  code: string;
  name: string;
  type: "consolidation" | "fulfillment" | "pickup_point" | "shop";
  country: number;
  country_name: string;
  city: number;
  city_name: string;
  status: "active" | "inactive" | "full";
}

export interface DeliveryEstimate {
  available: boolean;
  min_days?: number;
  max_days?: number;
  basis?: string;
  message?: string;
}

/* ------------------------------------------------------------------ api */

const P = "catalog/products";

export interface ProductListQuery extends QueryParams {
  search?: string;
  category?: string;
  status?: string;
  stock?: string;
  brand?: string;
  vendor?: string;
  /** "agiza" | "vendors" | a vendor id. */
  seller?: string;
  review_status?: string;
  page?: number;
  page_size?: number;
}

export const productsApi = {
  list: (query: ProductListQuery, signal?: AbortSignal) => api.get<Paginated<ProductRow>>(P, query, signal),
  get: (id: number) => api.get<ProductDetail>(`${P}/${id}`),
  create: (data: ProductWrite) => api.post<ProductDetail>(P, data),
  update: (id: number, data: Partial<ProductWrite>) => api.patch<ProductDetail>(`${P}/${id}`, data),
  remove: (id: number) => api.delete(`${P}/${id}`),
  stats: () => api.get<ProductStats>(`${P}/stats`),
  /** Review a self-service vendor's product; `note` is required to reject or disable. */
  moderate: (id: number, body: { action: ModerationAction; note: string }) =>
    api.post<ProductDetail>(`${P}/${id}/moderate`, body),
  uploadImage: (id: number, file: File, variant?: number) => {
    const body = new FormData();
    body.append("file", file);
    if (variant) body.append("variant", String(variant));
    return api.post<ProductDetail>(`${P}/${id}/images`, body);
  },
  makePrimary: (id: number, imageId: number) => api.post<ProductDetail>(`${P}/${id}/images/${imageId}`),
  removeImage: (id: number, imageId: number) => api.delete<ProductDetail>(`${P}/${id}/images/${imageId}`),
  /** Product search for the related / bought-together / gift pickers. */
  search: (search: string, signal?: AbortSignal) =>
    api.get<Paginated<ProductRow>>(P, { search, page_size: 10 }, signal).then((p) => p.results),
  deliveryEstimate: (query: { origin_country?: number; destination_city?: number; method: "air" | "sea"; sensitive: boolean }) =>
    api.get<DeliveryEstimate>("catalog/delivery-estimate", query),
};

export const productLookups = {
  categories: () => api.get<CategoryOption[]>("catalog/categories"),
  brands: () => api.get<BrandOption[]>("catalog/brands"),
  labels: () => api.get<LabelOption[]>("catalog/labels"),
  options: () => api.get<OptionSet[]>("catalog/options"),
  vendors: () => api.get<Paginated<VendorOption>>("catalog/vendors", { page_size: 100 }).then((p) => p.results),
  profiles: () =>
    api.get<Paginated<ProfileOption>>("shipping-engine/profiles", { page_size: 100 }).then((p) => p.results),
  methods: () =>
    api.get<Paginated<MethodOption>>("shipping-engine/methods", { page_size: 100 }).then((p) => p.results),
  warehouses: () => api.get<Paginated<WarehouseOption>>("warehouses", { page_size: 100 }).then((p) => p.results),
  countries: () => api.get<Country[]>("countries"),
  cities: (country: number) => api.get<City[]>("cities", { country }),
  engineSettings: () => api.get<{ default_volumetric_divisor: number }>("shipping-engine/settings"),
};

export const productKeys = {
  all: ["catalog", "products"] as const,
  list: (query: object) => ["catalog", "products", "list", query] as const,
  detail: (id: number) => ["catalog", "products", "detail", id] as const,
  stats: ["catalog", "products", "stats"] as const,
  search: (term: string) => ["catalog", "products", "search", term] as const,
  estimate: (query: object) => ["catalog", "delivery-estimate", query] as const,
  lookup: (name: string, arg?: unknown) => ["catalog", "lookup", name, arg ?? null] as const,
};

/** Reference lists change rarely: keep them fresh for a few minutes. */
export const LOOKUP_STALE = 5 * 60_000;
