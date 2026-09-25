import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";

/* ------------------------------------------------------------------ types */

export type ActiveStatus = "active" | "inactive";
export type Scope = "local" | "international";
export type Currency = "TZS" | "USD" | "AED" | "CNY";
export type PricingModel = "per_kg" | "per_cbm" | "per_vol_weight" | "per_item" | "fixed" | "manual";
export type AppliesTo = "general" | "profile" | "product";
export type Divisor = 5000 | 6000 | 3000 | 4000;

export interface Carrier {
  id: number;
  name: string;
  type: string;
  type_display: string;
  contact_email: string;
  contact_phone: string;
  origins: number[];
  origin_names: string[];
  destinations: number[];
  destination_names: string[];
  specializations: string[];
  notes: string;
  status: ActiveStatus;
  status_display: string;
  routes_count: number;
}

export interface ShippingMethod {
  id: number;
  name: string;
  code: string;
  category: "air" | "sea" | "land" | "local";
  category_display: string;
  carriers: number[];
  carrier_names: string[];
  estimated_delivery: string;
  description: string;
  max_weight_kg: string | null;
  requires_special_handling: boolean;
  status: ActiveStatus;
  status_display: string;
  routes_count: number;
}

export interface ShippingProfile {
  id: number;
  name: string;
  description: string;
  type: "standard" | "specialized" | "restricted" | "oversized" | "manual";
  type_display: string;
  handling: string[];
  handling_display: string[];
  notes: string;
  status: ActiveStatus;
  status_display: string;
  rules_count: number;
  products_count: number;
}

export interface ZoneDestination {
  id?: number;
  kind: "city" | "region" | "country";
  ref_id: number;
  name?: string;
}

export interface Zone {
  id: number;
  name: string;
  type: Scope;
  type_display: string;
  description: string;
  destinations: ZoneDestination[];
  status: "active" | "inactive" | "draft";
  status_display: string;
  routes_count: number;
  rules_count: number;
}

export interface Route {
  id: number;
  type: Scope;
  type_display: string;
  origin_country: number;
  origin_city: number | null;
  destination_country: number | null;
  destination_city: number | null;
  destination_zone: number | null;
  destination_kind: "city" | "zone" | "country";
  origin_label: string;
  destination_label: string;
  label: string;
  methods: number[];
  method_names: string[];
  notes: string;
  status: ActiveStatus;
  status_display: string;
  rules_count: number;
  estimated_delivery: string;
}

export interface ShippingRule {
  id: number;
  code: string;
  name: string;
  display_name: string;
  route: number;
  route_label: string;
  origin_label: string;
  destination_label: string;
  route_type: Scope;
  method: number;
  method_name: string;
  applies_to: AppliesTo;
  applies_to_display: string;
  profile: number | null;
  profile_name: string | null;
  product_sku: string;
  target_label: string;
  priority: 1 | 2 | 3;
  pricing_model: PricingModel;
  pricing_model_display: string;
  rate: string | null;
  currency: Currency;
  rate_display: string;
  volumetric_divisor: Divisor | null;
  min_weight_kg: string | null;
  max_weight_kg: string | null;
  min_cbm: string | null;
  max_cbm: string | null;
  min_volumetric_kg: string | null;
  max_volumetric_kg: string | null;
  minimum_charge: string | null;
  minimum_charge_display: string | null;
  eta_min_days: number | null;
  eta_max_days: number | null;
  estimated_delivery: string;
  carrier: number | null;
  carrier_name: string | null;
  status: ActiveStatus;
  status_display: string;
  updated_at: string;
}

export interface RuleOverride {
  id: number;
  code: string;
  route: number;
  route_label: string;
  destination_city: number | null;
  destination_region: number | null;
  destination_label: string;
  profile: number | null;
  profile_name: string | null;
  pricing_model: Exclude<PricingModel, "manual">;
  pricing_model_display: string;
  rate: string;
  currency: Currency;
  override_rate_display: string;
  original_rule: { id: number; code: string; rate_display: string } | null;
  reason: string;
  start_date: string;
  end_date: string;
  status: ActiveStatus;
  status_display: string;
  is_current: boolean;
  created_by_name: string | null;
  created_at: string;
}

export interface EngineSettings {
  local_currency: Currency;
  international_currency: Currency;
  display_currency: Currency;
  exchange_rate_source: "manual" | "auto";
  default_volumetric_divisor: Divisor;
  no_rule_fallback: "manual_quote" | "block" | "error";
  cbm_method: "dimensions" | "manual";
  weight_rounding: "half_kg" | "one_kg" | "exact";
  apply_minimum_charge: boolean;
  show_details_to_customers: boolean;
  current_rates: { base_currency: Currency; quote_currency: Currency; rate: string | null; effective_date: string | null }[];
  updated_at: string;
  updated_by_name: string | null;
}

export interface ExchangeRate {
  id: number;
  base_currency: Currency;
  quote_currency: Currency;
  rate: string;
  effective_date: string;
  created_by_name: string | null;
  created_at: string;
}

export interface Overview {
  stats: {
    active_routes: number;
    zones: number;
    active_rules: number;
    profiles: number;
    carriers: number;
    manual_quote_rules: number;
    active_overrides: number;
  };
  recent_rules: {
    id: number;
    code: string;
    name: string;
    origin_label: string;
    destination_label: string;
    method: string;
    profile: string;
    pricing_model_display: string;
    rate_display: string;
    status: ActiveStatus;
    updated_at: string;
  }[];
}

export interface CalculateInput {
  origin_country: number;
  origin_city?: number | null;
  destination_country?: number | null;
  destination_city?: number | null;
  destination_zone?: number | null;
  method: number;
  profile?: number | null;
  product_sku?: string;
  weight_kg: string;
  quantity: number;
  length_cm?: string | null;
  width_cm?: string | null;
  height_cm?: string | null;
  cbm?: string | null;
}

export interface CalculationResult {
  status: "priced" | "manual_quote" | "blocked" | "no_rule";
  message: string;
  route: { id: number; label: string; type: Scope } | null;
  method: { id: number; name: string; code: string };
  profile: { id: number; name: string; type: string; handling: string[] } | null;
  carrier: { id: number; name: string } | null;
  rule: {
    id: number;
    code: string;
    name: string;
    applies_to: AppliesTo;
    applies_to_display: string;
    target: string;
    priority: number;
    priority_display: string;
    pricing_model: PricingModel;
    pricing_model_display: string;
    rate: string | null;
    currency: Currency;
    rate_display: string;
    minimum_charge: string | null;
    minimum_charge_display: string | null;
    estimated_delivery: string;
  } | null;
  override: {
    id: number;
    code: string;
    reason: string;
    original_rate_display: string;
    override_rate_display: string;
    start_date: string;
    end_date: string;
  } | null;
  measurements: {
    quantity: number;
    actual_weight_kg: string;
    cbm: string | null;
    cbm_source: "dimensions" | "manual" | null;
    volumetric_divisor: number;
    volumetric_weight_kg: string | null;
    chargeable_weight_kg?: string | null;
    weight_basis?: "actual" | "volumetric" | null;
  };
  pricing: {
    pricing_model: PricingModel;
    pricing_model_display: string;
    base_rate: string;
    rate_display: string;
    units: string;
    unit_label: string;
    subtotal: string;
    amount: string;
    amount_display: string;
    subtotal_display: string;
    minimum_charge: string | null;
    minimum_charge_display: string | null;
    minimum_applied: boolean;
    source_currency: Currency;
    target_currency: Currency;
    exchange_rate: string;
    exchange_rate_date: string | null;
    total: string;
    total_display: string;
    chargeable_weight_kg: string | null;
    weight_basis: "actual" | "volumetric" | null;
    volumetric_divisor: number;
    volumetric_weight_kg: string | null;
  } | null;
  estimated_delivery: string | null;
  requires_special_handling: boolean;
  special_handling: string[];
  explanation: { ok: boolean; text: string }[];
  considered: { code: string; label: string; rate_display: string; priority: number; reason: string }[];
  summary: Record<string, string | boolean | null> | null;
}

/* ---------------------------------------------------------------- service */

const R = "shipping-engine";

function crud<T, W = Partial<T>>(resource: string) {
  return {
    list: (query?: QueryParams, signal?: AbortSignal) => api.get<Paginated<T>>(`${R}/${resource}`, query, signal),
    /** All rows for dropdowns (reference lists are small). */
    all: (query?: QueryParams) =>
      api.get<Paginated<T>>(`${R}/${resource}`, { page_size: 100, ...query }).then((p) => p.results),
    get: (id: number) => api.get<T>(`${R}/${resource}/${id}`),
    create: (data: W) => api.post<T>(`${R}/${resource}`, data),
    update: (id: number, data: W) => api.patch<T>(`${R}/${resource}/${id}`, data),
    remove: (id: number) => api.delete(`${R}/${resource}/${id}`),
  };
}

export const engine = {
  overview: (type: Scope) => api.get<Overview>(`${R}/overview`, { type }),
  zones: crud<Zone, Record<string, unknown>>("zones"),
  routes: crud<Route, Record<string, unknown>>("routes"),
  methods: {
    ...crud<ShippingMethod, Record<string, unknown>>("methods"),
    stats: () => api.get<Record<"air" | "sea" | "land" | "local", number>>(`${R}/methods/stats`),
  },
  profiles: {
    ...crud<ShippingProfile, Record<string, unknown>>("profiles"),
    duplicate: (id: number) => api.post<ShippingProfile>(`${R}/profiles/${id}/duplicate`),
  },
  rules: crud<ShippingRule, Record<string, unknown>>("rules"),
  carriers: crud<Carrier, Record<string, unknown>>("carriers"),
  overrides: crud<RuleOverride, Record<string, unknown>>("overrides"),
  settings: {
    get: () => api.get<EngineSettings>(`${R}/settings`),
    update: (data: Partial<EngineSettings>) => api.patch<EngineSettings>(`${R}/settings`, data),
  },
  exchangeRates: {
    list: (query?: QueryParams) => api.get<Paginated<ExchangeRate>>(`${R}/exchange-rates`, query),
    create: (data: { base_currency: Currency; quote_currency: Currency; rate: string }) =>
      api.post<ExchangeRate>(`${R}/exchange-rates`, data),
  },
  calculate: (data: CalculateInput) => api.post<CalculationResult>(`${R}/calculate`, data),
};

/** Query-key roots so a mutation can invalidate every list of a resource. */
export const seKeys = {
  all: ["se"] as const,
  overview: (type: Scope) => ["se", "overview", type] as const,
  list: (resource: string, query?: object) => ["se", resource, "list", query ?? {}] as const,
  resource: (resource: string) => ["se", resource] as const,
  settings: ["se", "settings"] as const,
};

/* -------------------------------------------------------------- constants */

export const PRICING_OPTIONS: { id: PricingModel; label: string }[] = [
  { id: "per_kg", label: "Per KG" },
  { id: "per_cbm", label: "Per CBM" },
  { id: "per_vol_weight", label: "Per Vol. Weight" },
  { id: "per_item", label: "Per Item" },
  { id: "fixed", label: "Fixed Shipment" },
  { id: "manual", label: "Manual Quote" },
];

export const DIVISOR_OPTIONS: { value: Divisor; label: string }[] = [
  { value: 5000, label: "5,000 (standard air)" },
  { value: 6000, label: "6,000 (IATA standard)" },
  { value: 3000, label: "3,000 (sea/express)" },
  { value: 4000, label: "4,000 (custom)" },
];

export const CURRENCY_OPTIONS: { value: Currency; label: string }[] = [
  { value: "TZS", label: "TSh — Tanzanian Shilling (TZS)" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
];

export const CURRENCY_PREFIX: Record<Currency, string> = { TZS: "TSh", USD: "$", AED: "AED", CNY: "¥" };

export const HANDLING_OPTIONS: { value: string; label: string }[] = [
  { value: "contains_battery", label: "Contains battery" },
  { value: "fragile", label: "Fragile" },
  { value: "electronics", label: "Electronics" },
  { value: "hazardous", label: "Hazardous material" },
  { value: "restricted", label: "Restricted handling" },
  { value: "special_documentation", label: "Special documentation" },
  { value: "temperature_controlled", label: "Temperature controlled" },
  { value: "oversized", label: "Oversized" },
  { value: "other", label: "Other" },
];

export const CARRIER_TYPES = [
  { value: "international_air", label: "International Air" },
  { value: "international_sea", label: "International Sea" },
  { value: "local_ground", label: "Local Ground" },
  { value: "local_delivery", label: "Local Delivery" },
  { value: "express_courier", label: "Express Courier" },
];

export const PROFILE_TYPES = [
  { value: "standard", label: "Standard" },
  { value: "specialized", label: "Specialized" },
  { value: "restricted", label: "Restricted" },
  { value: "oversized", label: "Oversized" },
  { value: "manual", label: "Manual" },
];
