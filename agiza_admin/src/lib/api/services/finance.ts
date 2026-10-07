import { api, buildQuery, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { PersonRef } from "./orders";

/* ------------------------------------------------------------------ types */

/** Decimal amounts arrive as exact strings ("1250000.00"), null when unknown. */
export type Money = string | null;

export type OrderType = "express" | "international" | "equipment" | "shop";
export type PaymentMethod = "cash" | "mobile_money" | "bank_transfer" | "card" | "wallet" | "other";
/** Methods staff can pick (wallet payments go through the wallet endpoint). */
export type ManualMethod = Exclude<PaymentMethod, "wallet">;
export type PaymentKind = "advance" | "installment" | "balance" | "refund";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceSource = "quote" | "order" | "manual";
export type PlanStatus = "pending_approval" | "active" | "completed" | "rejected" | "cancelled";
export type InstallmentStatus = "pending" | "partial" | "paid";

export interface FinanceStats {
  revenue: string;
  paid: string;
  profit: string;
  due: string;
  orders: number;
  wallet_balance: string;
  overdue_installments: number;
}

export interface FinanceCustomer {
  id: number;
  reference: string;
  full_name: string;
  phone: string;
  email?: string;
}

export interface OrderFigures {
  total: Money;
  paid: Money;
  due: Money;
  purchase_cost: Money;
  shipping_cost: Money;
  profit: Money;
  margin: Money;
  purchase_cost_set: boolean;
  shipping_cost_set: boolean;
}

export interface OrderPayment {
  id: number;
  reference: string;
  order_type: OrderType;
  order_type_display: string;
  status: string;
  status_display: string;
  item_details: string;
  customer: FinanceCustomer;
  currency: string;
  created_at: string;
  figures: OrderFigures;
}

export interface LedgerPayment {
  id: number;
  order: { id: number; reference: string; order_type: OrderType; customer: string };
  amount: string;
  currency: string;
  method: PaymentMethod;
  method_display: string;
  kind: PaymentKind;
  kind_display: string;
  reference: string;
  paid_at: string;
  notes: string;
  recorded_by: PersonRef | null;
  created_at: string;
}

export interface Receipt {
  order: OrderPayment;
  payments: LedgerPayment[];
  issued_at: string;
}

export interface InvoiceItem {
  id: number;
  description: string;
  quantity: string;
  unit_price: string;
  amount: string;
}

export interface Invoice {
  id: number;
  reference: string;
  source: InvoiceSource;
  source_display: string;
  customer: FinanceCustomer;
  linked: { kind: "order" | "quote"; id: number; reference: string; order_type: OrderType | null } | null;
  status: InvoiceStatus;
  status_display: string;
  currency: string;
  issue_date: string;
  due_date: string | null;
  tax_rate: string;
  notes: string;
  items: InvoiceItem[];
  totals: { subtotal: string; tax: string; total: string; paid: string; balance: string };
  sent_at: string | null;
  paid_at: string | null;
  payment_method: string;
  payment_reference: string;
  created_by: PersonRef | null;
  created_at: string;
}

export interface InvoiceCreate {
  source: InvoiceSource;
  quote?: number;
  order?: number;
  customer?: number;
  items?: { description: string; quantity: string; unit_price: string }[];
  due_date?: string | null;
  tax_rate: string;
  notes: string;
}

export interface WalletPlanSummary {
  plan_id: number;
  order_id: number;
  order: string;
  status: PlanStatus;
  status_display: string;
  total: string;
  paid: string;
  next_due: string | null;
  next_amount: Money;
}

export interface WalletRow {
  customer: FinanceCustomer;
  wallet_balance: string;
  total_orders: number;
  total_paid: string;
  total_due: string;
  installment_plans: WalletPlanSummary[];
}

export interface WalletTransaction {
  id: number;
  kind: "credit" | "debit";
  kind_display: string;
  source: "top_up" | "refund" | "order_payment" | "adjustment";
  source_display: string;
  amount: string;
  balance_after: string;
  order: string | null;
  method: string;
  reference: string;
  note: string;
  created_by: PersonRef | null;
  created_at: string;
}

export interface WalletDetail extends WalletRow {
  transactions: WalletTransaction[];
}

export interface Installment {
  id: number;
  sequence: number;
  due_date: string;
  amount: string;
  paid_amount: string;
  status: InstallmentStatus;
  status_display: string;
  paid_at: string | null;
}

export interface InstallmentPlan {
  id: number;
  order: { id: number; reference: string; order_type: OrderType };
  customer: FinanceCustomer;
  status: PlanStatus;
  status_display: string;
  total_amount: string;
  number_of_installments: number;
  interval_days: number;
  notes: string;
  next_payment: { due_date: string; amount: string; sequence: number } | null;
  installments: Installment[];
  approved_by: PersonRef | null;
  approved_at: string | null;
  decision_note: string;
  created_at: string;
}

/** Totals of the Profit & Loss report (margin = profit / revenue, %; null when revenue is 0). */
export interface ProfitLossFigures {
  orders: number;
  revenue: string;
  purchase_cost: string;
  shipping_cost: string;
  profit: string;
  margin: Money;
}

export interface ProfitLossRow {
  id: number;
  reference: string;
  date: string;
  customer: { id: number; reference: string; full_name: string };
  order_type: OrderType;
  order_type_display: string;
  status: string;
  status_display: string;
  item_details: string;
  total: string;
  purchase_cost: string;
  shipping_cost: string;
  profit: string;
  margin: Money;
  purchase_cost_set: boolean;
  shipping_cost_set: boolean;
}

export interface ProfitLossReport extends Paginated<ProfitLossRow> {
  totals: ProfitLossFigures;
  by_type: (ProfitLossFigures & { order_type: OrderType; order_type_display: string })[];
}

/* ---------------------------------------------------------------- service */

export const financeApi = {
  stats: () => api.get<FinanceStats>("finance/stats"),

  profitLoss: {
    get: (query: QueryParams, signal?: AbortSignal) => api.get<ProfitLossReport>("finance/profit-loss", query, signal),
    /** Same-origin proxy URL of the CSV export (same filters as the report). */
    csvUrl: (query: QueryParams) => `/api/proxy/finance/profit-loss/export/${buildQuery(query)}`,
  },

  orderPayments: {
    list: (query: QueryParams, signal?: AbortSignal) =>
      api.get<Paginated<OrderPayment>>("finance/order-payments", query, signal),
    get: (id: number) => api.get<OrderPayment>(`finance/order-payments/${id}`),
    /** null restores the automatic default for that cost. */
    setCosts: (id: number, data: { purchase_cost: string | null; shipping_cost: string | null }) =>
      api.patch<OrderPayment>(`finance/order-payments/${id}`, data),
    receipt: (id: number) => api.get<Receipt>(`finance/order-payments/${id}/receipt`),
  },

  payments: {
    list: (query: QueryParams, signal?: AbortSignal) =>
      api.get<Paginated<LedgerPayment>>("finance/payments", query, signal),
    record: (data: {
      order: number;
      amount: string;
      method: ManualMethod;
      kind: Exclude<PaymentKind, "refund">;
      reference: string;
      paid_at?: string;
      notes: string;
    }) => api.post<LedgerPayment>("finance/payments", data),
    fromWallet: (data: { order: number; amount: string }) =>
      api.post<LedgerPayment>("finance/payments/from-wallet", data),
  },

  invoices: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Invoice>>("finance/invoices", query, signal),
    get: (id: number) => api.get<Invoice>(`finance/invoices/${id}`),
    create: (data: InvoiceCreate) => api.post<Invoice>("finance/invoices", data),
    send: (id: number) => api.post<Invoice>(`finance/invoices/${id}/send`),
    markPaid: (id: number, data: { method: ManualMethod; reference: string }) =>
      api.post<Invoice>(`finance/invoices/${id}/mark-paid`, data),
    void: (id: number) => api.post<Invoice>(`finance/invoices/${id}/void`),
    /** Same-origin proxy URL of the PDF (the session cookie authenticates it). */
    pdfUrl: (id: number) => `/api/proxy/finance/invoices/${id}/pdf/`,
  },

  wallets: {
    list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<WalletRow>>("finance/wallets", query, signal),
    get: (customerId: number) => api.get<WalletDetail>(`finance/wallets/${customerId}`),
    topUp: (customerId: number, data: { amount: string; method: ManualMethod; reference: string; note: string }) =>
      api.post<WalletDetail>(`finance/wallets/${customerId}/top-up`, data),
    adjust: (customerId: number, data: { amount: string; credit: boolean; note: string }) =>
      api.post<WalletDetail>(`finance/wallets/${customerId}/adjust`, data),
  },

  plans: {
    list: (query: QueryParams, signal?: AbortSignal) =>
      api.get<Paginated<InstallmentPlan>>("finance/installment-plans", query, signal),
    create: (data: {
      order: number;
      number_of_installments: number;
      first_due_date: string;
      interval_days: number;
      notes: string;
    }) => api.post<InstallmentPlan>("finance/installment-plans", data),
    decide: (id: number, data: { approve: boolean; note: string }) =>
      api.post<InstallmentPlan>(`finance/installment-plans/${id}/decide`, data),
  },
};

export const financeKeys = {
  all: ["finance"] as const,
  stats: ["finance", "stats"] as const,
  profitLoss: (query: object) => ["finance", "profit-loss", query] as const,
  orderPayments: (query: object) => ["finance", "order-payments", query] as const,
  receipt: (id: number) => ["finance", "receipt", id] as const,
  ledger: (query: object) => ["finance", "payments", query] as const,
  invoices: (query: object) => ["finance", "invoices", query] as const,
  invoice: (id: number) => ["finance", "invoice", id] as const,
  wallets: (query: object) => ["finance", "wallets", query] as const,
  wallet: (customerId: number) => ["finance", "wallet", customerId] as const,
  plans: (query: object) => ["finance", "plans", query] as const,
};
