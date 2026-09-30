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
  /** Days after delivery during which customers can ask to return items (0–90). */
  return_window_days: number;
  /** Customer reviews go live at once (off: they wait for approval). */
  auto_publish_reviews: boolean;
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
  /** A problem the seller reported (null when none was ever reported). */
  issue: FulfillmentIssue | null;
  /** The collection leg from the seller's premises, when there is one. */
  pickup: { reference: string; status: string; status_display: string } | null;
}

export type IssueType = "cannot_fulfill" | "item_unavailable" | "stock_discrepancy" | "damaged_item" | "other";

export interface FulfillmentIssue {
  type: IssueType;
  type_display: string;
  note: string;
  reported_at: string;
  resolved_at: string | null;
  resolution: string;
  open: boolean;
}

export type IssueResolution = "continue" | "cancel_part";

export interface FulfillmentQuery extends QueryParams {
  vendor?: string | number;
  order?: number;
  status?: string;
  settlement_status?: string;
  issue_open?: boolean;
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
  /** In a payout that is still processing. */
  in_payout: string;
  /** Refunds deducted from this vendor's earnings. */
  refunds: string;
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
    refunds_to_customers: string;
    payable_to_vendors: string;
    paid_to_vendors: string;
  };
  vendors: VendorEarningsRow[];
}

export type PayoutMethod = "mobile_money" | "bank" | "cash" | "other";

export type PayoutStatus = "processing" | "paid" | "failed" | "reversed";

export interface Payout {
  id: number;
  reference: string;
  vendor: { id: number; name: string };
  batch: string | null;
  status: PayoutStatus;
  status_display: string;
  amount: string;
  currency: string;
  gross_sales: string;
  commission: string;
  refund_deductions: string;
  adjustments: string;
  method: PayoutMethod;
  method_display: string;
  /** Where the money goes (the vendor's payout account at the time). */
  destination: string;
  transaction_reference: string;
  paid_at: string | null;
  notes: string;
  failure_reason: string;
  orders: number | null;
  recorded_by: string | null;
  processed_by: string | null;
  processed_at: string | null;
  created_at: string;
}

/**
 * The amount is never sent: the server pays out the vendor's whole payable
 * balance. `record_as_paid` (default true) needs the transfer reference;
 * false starts a processing payout instead.
 */
export interface PayoutInput {
  vendor: number;
  method: PayoutMethod;
  record_as_paid?: boolean;
  transaction_reference?: string;
  paid_at?: string | null;
  notes?: string;
}

export interface PayoutQuery extends QueryParams {
  vendor?: number;
  status?: string;
  batch?: string;
  page?: number;
  page_size?: number;
}

export interface PayoutBatchSummary {
  reference: string;
  created_at: string;
  notes: string;
  created_by: string | null;
  payouts: number;
  total: string;
  statuses: PayoutStatus[];
}

export interface PayoutBatchCreated {
  reference: string;
  payouts: Payout[];
}

export type LedgerKind = "earning" | "refund" | "adjustment" | "payout" | "payout_reversal";

export interface LedgerBalance {
  payable: string;
  gross_sales: string;
  commission: string;
  refunds: string;
  adjustments: string;
  paid_out: string;
  in_payout: string;
  pending: string;
}

export interface LedgerEntry {
  id: number;
  kind: LedgerKind;
  kind_display: string;
  amount: string;
  gross_amount: string | null;
  commission_amount: string | null;
  reference: string;
  note: string;
  at: string;
  by: string;
}

export interface VendorLedger {
  vendor: { id: number; name: string };
  balance: LedgerBalance;
  entries: LedgerEntry[];
}

export type ProductReviewStatus = "published" | "pending" | "flagged" | "hidden";

export interface ProductReviewRow {
  id: number;
  product: { id: number; name: string };
  vendor: { id: number | null; name: string };
  customer: { id: number; name: string };
  rating: number;
  title: string;
  body: string;
  status: ProductReviewStatus;
  status_display: string;
  verified_purchase: boolean;
  vendor_reply: string;
  flag_reason: string;
  moderation_note: string;
  moderated_by: string | null;
  created_at: string;
  edited_at: string | null;
}

export interface ReviewQuery extends QueryParams {
  status?: string;
  vendor?: number;
  product?: number;
  rating?: number | string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface VendorDocument {
  id: number;
  kind: string;
  kind_display: string;
  original_name: string;
  content_type: string;
  /** API path for fileSrc(). */
  url: string;
  uploaded_at: string;
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
  batches: ["marketplace", "payout-batches"] as const,
  ledger: (vendor: number) => ["marketplace", "ledger", vendor] as const,
  reviews: (query: object) => ["marketplace", "reviews", query] as const,
  documents: (vendor: number) => ["marketplace", "documents", vendor] as const,
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
  /** Decide on a seller's reported problem: carry on, or cancel that seller's part of the order. */
  resolveIssue: (id: number, body: { action: IssueResolution; note: string }) =>
    api.post<Fulfillment>(`marketplace/fulfillments/${id}/resolve`, body),

  earnings: (query: { vendor?: number } = {}, signal?: AbortSignal) =>
    api.get<Earnings>("marketplace/earnings", query, signal),

  payouts: {
    list: (query: PayoutQuery, signal?: AbortSignal) => api.get<Paginated<Payout>>("marketplace/payouts", query, signal),
    create: (body: PayoutInput) => api.post<Payout>("marketplace/payouts", body),
    markPaid: (id: number, body: { transaction_reference: string; notes?: string }) =>
      api.post<Payout>(`marketplace/payouts/${id}/paid`, body),
    markFailed: (id: number, body: { reason: string }) => api.post<Payout>(`marketplace/payouts/${id}/failed`, body),
    reverse: (id: number, body: { reason: string }) => api.post<Payout>(`marketplace/payouts/${id}/reverse`, body),
  },

  batches: {
    list: (signal?: AbortSignal) => api.get<PayoutBatchSummary[]>("marketplace/payout-batches", undefined, signal),
    create: (body: { vendors?: number[]; notes?: string }) => api.post<PayoutBatchCreated>("marketplace/payout-batches", body),
  },

  ledger: (vendor: number, signal?: AbortSignal) => api.get<VendorLedger>("marketplace/ledger", { vendor }, signal),
  /** Finance manage only. `amount` is signed: + credits, − debits the vendor. */
  adjust: (body: { vendor: number; amount: string; reason: string }) =>
    api.post<{ id: number; amount: string; balance: LedgerBalance }>("marketplace/adjustments", body),

  reviews: {
    list: (query: ReviewQuery, signal?: AbortSignal) => api.get<Paginated<ProductReviewRow>>("marketplace/reviews", query, signal),
    moderate: (id: number, body: { action: "publish" | "hide"; note: string }) =>
      api.post<ProductReviewRow>(`marketplace/reviews/${id}/moderate`, body),
  },

  documents: (vendor: number, signal?: AbortSignal) =>
    api.get<VendorDocument[]>(`marketplace/vendors/${vendor}/documents`, undefined, signal),
};
