import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { Transition } from "./orders";

/* ------------------------------------------------------------------ types */

export type ReturnStatus = "initiated" | "in_transit" | "received" | "inspected" | "approved" | "rejected" | "closed";
export type ReturnOwner = "delivery" | "warehouse" | "support" | "finance";
export type ReturnType =
  | "delivery_failed"
  | "customer_rejected"
  | "damaged_item"
  | "wrong_item"
  | "cancellation_after_dispatch"
  | "customer_request"
  | "seller_cannot_fulfill";
export type ReasonCode =
  | "customer_unavailable"
  | "address_incorrect"
  | "damaged_in_transit"
  | "customer_changed_mind"
  | "item_mismatch"
  | "defective"
  | "not_as_described"
  | "seller_unavailable";
export type FinancialImpact = "refund_required" | "replacement_required" | "no_refund";
export type ReturnExceptionFlag = "dispute" | "high_value_item" | "customer_complaint";
export type ItemCondition = "as_described" | "damaged" | "missing_parts" | "used";
export type RefundMethod = "cash" | "mobile_money" | "bank_transfer" | "card" | "wallet" | "other";
/** Workflow actions available for the return's current status. */
export type ReturnAction = "transition" | "decide" | "inspect" | "close";
/** The refund as the customer sees it. */
export type RefundStatus = "not_decided" | "pending" | "refunded" | "none";

export interface ReturnLine {
  id: number;
  /** Order item id. */
  item: number;
  name: string;
  variant_name: string;
  quantity: number;
  amount: string | null;
  /** Vendor name, or "AGIZA". */
  seller: string;
}

export interface ReturnAttachment {
  id: number;
  /** API path for fileSrc(): returns/<id>/attachments/<aid>/file */
  url: string;
  content_type: string;
  at: string;
}

export interface VendorResponse {
  vendor: string;
  message: string;
  at: string;
}

export interface ReturnRequest {
  id: number;
  reference: string;
  order: { id: number; reference: string; order_type: string };
  customer: { id: number; full_name: string; phone: string };
  delivery: { id: number; reference: string } | null;
  return_type: ReturnType;
  return_type_display: string;
  reason_code: ReasonCode;
  reason_code_display: string;
  status: ReturnStatus;
  status_display: string;
  owner: ReturnOwner;
  owner_display: string;
  handler: { id: number; full_name: string; role: string } | null;
  item_details: string;
  return_value: string | null;
  financial_impact: FinancialImpact;
  financial_impact_display: string;
  exception_flag: ReturnExceptionFlag | "";
  exception_flag_display: string;
  item_condition: ItemCondition | "";
  item_condition_display: string;
  inspection_notes: string;
  inspected_at: string | null;
  decision_notes: string;
  decided_at: string | null;
  refund_amount: string | null;
  resolution_notes: string;
  closed_at: string | null;
  notes: string;
  last_update: { at: string; department: ReturnOwner };
  actions: ReturnAction[];
  allowed_transitions: Transition[];
  created_at: string;
  updated_at: string;
  /** Opened by the customer from their account (app / website). */
  requested_by_customer: boolean;
  /** The customer's explanation. */
  customer_note: string;
  /** The latest message AGIZA sent the customer about this return. */
  customer_message: string;
  /** Returned units were put back into sellable stock. */
  restocked: boolean;
  /** When vendor earnings were adjusted for the refund. */
  reconciled_at: string | null;
  lines: ReturnLine[];
  attachments: ReturnAttachment[];
  vendor_responses: VendorResponse[];
  refund_status: RefundStatus;
  /** Status in the customer's words ("Item on its way back", "Refund pending"...). */
  customer_status_display: string;
  sellers: string[];
}

export interface ReturnHistoryEntry {
  id: number;
  from_status: string;
  from_status_display: string | null;
  to_status: ReturnStatus;
  to_status_display: string | null;
  owner: ReturnOwner;
  owner_display: string;
  changed_by: { id: number; full_name: string } | null;
  note: string;
  created_at: string;
}

export interface ReturnStats {
  active: number;
  completed: number;
  with_exceptions: number;
  /** Decimal string, TSh. */
  pending_refunds: string;
}

export interface ReturnHandler {
  id: number;
  full_name: string;
  staff_level: string;
  role: string;
}

export interface ReturnCreateInput {
  order: number;
  return_type: ReturnType;
  reason_code: ReasonCode;
  item_details?: string;
  return_value?: string | null;
  financial_impact?: FinancialImpact;
  handler?: number | null;
  exception_flag?: ReturnExceptionFlag | "";
  notes?: string;
}

/* ---------------------------------------------------------------- service */

const base = "returns";

export const returnsApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<ReturnRequest>>(base, query, signal),
  get: (id: number) => api.get<ReturnRequest>(`${base}/${id}`),
  stats: () => api.get<ReturnStats>(`${base}/stats`),
  handlers: () => api.get<ReturnHandler[]>(`${base}/handlers`),
  create: (data: ReturnCreateInput) => api.post<ReturnRequest>(base, data),
  update: (id: number, data: Partial<Omit<ReturnCreateInput, "order" | "return_type" | "handler">>) =>
    api.patch<ReturnRequest>(`${base}/${id}`, data),
  transition: (id: number, data: { status: ReturnStatus; note?: string }) =>
    api.post<ReturnRequest>(`${base}/${id}/transition`, data),
  inspect: (
    id: number,
    data: { item_condition: ItemCondition; notes: string; financial_impact?: FinancialImpact; restock?: boolean },
  ) =>
    api.post<ReturnRequest>(`${base}/${id}/inspect`, data),
  decide: (
    id: number,
    data: { approve: boolean; notes: string; financial_impact?: FinancialImpact; refund_amount?: string | null },
  ) => api.post<ReturnRequest>(`${base}/${id}/decide`, data),
  close: (id: number, data: { notes?: string; refund_method?: RefundMethod | null; refund_reference?: string }) =>
    api.post<ReturnRequest>(`${base}/${id}/close`, data),
  reassign: (id: number, data: { handler: number; note?: string }) =>
    api.post<ReturnRequest>(`${base}/${id}/reassign`, data),
  history: (id: number) => api.get<ReturnHistoryEntry[]>(`${base}/${id}/history`),
  /** Tell the customer something (shown in their account and sent as a notification). */
  message: (id: number, data: { message: string }) => api.post<ReturnRequest>(`${base}/${id}/message`, data),
};

export const returnKeys = {
  all: ["returns"] as const,
  list: (query: object) => ["returns", "list", query] as const,
  stats: ["returns", "stats"] as const,
  handlers: ["returns", "handlers"] as const,
  history: (id: number) => ["returns", "history", id] as const,
};
