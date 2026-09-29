/**
 * Multi-vendor marketplace (backend/apps/marketplace/views.py): marketplace
 * settings and commission rates, each seller's part of an order, earnings and
 * payouts. Amounts are decimal strings, as everywhere else.
 */
import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";

/* ------------------------------------------------------------------ types */

export interface MarketplaceSettings {
  default_commission_percent: string;
  require_product_review: boolean;
  vendor_applications_open: boolean;
  payout_schedule: string;
  updated_at: string;
}
export type MarketplaceSettingsInput = Partial<Omit<MarketplaceSettings, "updated_at">>;

export interface CategoryCommission {
  id: number;
  category: number;
  category_name: string;
  percent: string;
  updated_at: string;
}
export interface CategoryCommissionInput {
  category: number;
  percent: string;
}

export type FulfillmentStatus = "pending" | "accepted" | "ready" | "shipped" | "delivered" | "cancelled";
export type SettlementStatus = "pending" | "payable" | "settled" | "void";

/** One seller's part of an order (vendor `id: null` = AGIZA's own items). */
export interface Fulfillment {
  id: number;
  reference: string;
  order_id: number;
  order_reference: string;
  order_status: string;
  customer: string;
  vendor: { id: number | null; name: string; self_service: boolean };
  status: FulfillmentStatus;
  status_display: string;
  item_count: number;
  subtotal: string;
  commission: string;
  vendor_net: string;
  shipping_fee: string;
  settlement_status: SettlementStatus;
  settlement_display: string;
  payout: string | null;
  origin: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
}

export interface FulfillmentQuery extends QueryParams {
  vendor?: string | number;
  order?: number;
  status?: string;
  settlement_status?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface VendorEarningsRow {
  vendor: { id: number; name: string; self_service: boolean };
  gross_sales: string;
  commission: string;
  vendor_net: string;
  orders: number;
  pending: string;
  payable: string;
  paid_out: string;
}

export interface Earnings {
  marketplace: {
    gross_sales: string;
    commission: string;
    vendor_net: string;
    shipping_fees: string;
    orders: number;
    agiza_own_sales: string;
    vendor_sales: string;
    platform_commission: string;
    vendor_earnings: string;
  };
  vendors: VendorEarningsRow[];
}

export type PayoutMethod = "mobile_money" | "bank" | "cash" | "other";

export interface Payout {
  id: number;
  reference: string;
  vendor: { id: number; name: string };
  amount: string;
  currency: string;
  method: PayoutMethod;
  method_display: string;
  transaction_reference: string;
  paid_at: string;
  notes: string;
  orders: number | null;
  recorded_by: string | null;
  created_at: string;
}

/** The amount is never sent: the server pays out everything payable (or the chosen parts). */
export interface PayoutInput {
  vendor: number;
  method: PayoutMethod;
  transaction_reference?: string;
  paid_at?: string | null;
  notes?: string;
  fulfillments?: number[];
}

export const PAYOUT_METHODS: { value: PayoutMethod; label: string }[] = [
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

/* ------------------------------------------------------------------ keys */

export const marketplaceKeys = {
  all: ["marketplace"] as const,
  settings: ["marketplace", "settings"] as const,
  categoryCommissions: ["marketplace", "category-commissions"] as const,
  fulfillments: (query: object) => ["marketplace", "fulfillments", query] as const,
  earnings: (query: object) => ["marketplace", "earnings", query] as const,
  payouts: (query: object) => ["marketplace", "payouts", query] as const,
};

/* ------------------------------------------------------------------ api */

export const marketplaceApi = {
  settings: {
    get: (signal?: AbortSignal) => api.get<MarketplaceSettings>("marketplace/settings", undefined, signal),
    update: (body: MarketplaceSettingsInput) => api.patch<MarketplaceSettings>("marketplace/settings", body),
  },

  categoryCommissions: {
    list: (signal?: AbortSignal) => api.get<CategoryCommission[]>("marketplace/category-commissions", undefined, signal),
    create: (body: CategoryCommissionInput) => api.post<CategoryCommission>("marketplace/category-commissions", body),
    update: (id: number, body: Partial<CategoryCommissionInput>) =>
      api.patch<CategoryCommission>(`marketplace/category-commissions/${id}`, body),
    remove: (id: number) => api.delete(`marketplace/category-commissions/${id}`),
  },

  fulfillments: (query: FulfillmentQuery, signal?: AbortSignal) =>
    api.get<Paginated<Fulfillment>>("marketplace/fulfillments", query, signal),

  earnings: (query: { vendor?: number } = {}, signal?: AbortSignal) =>
    api.get<Earnings>("marketplace/earnings", query, signal),

  payouts: {
    list: (query: { vendor?: number; page?: number; page_size?: number }, signal?: AbortSignal) =>
      api.get<Paginated<Payout>>("marketplace/payouts", query, signal),
    create: (body: PayoutInput) => api.post<Payout>("marketplace/payouts", body),
  },
};
