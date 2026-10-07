import { api, type QueryParams } from "../client";
import type { OrderType } from "./finance";

export type ReportPeriod = "7d" | "30d" | "90d" | "this_month" | "this_year" | "custom";

/** % change vs the previous period; percent is null when the previous period had nothing. */
export interface Change {
  percent: number | null;
  direction: "up" | "down" | "flat";
}

export interface OrderTotals {
  count: number;
  total_amount: string;
}

export interface ReportsDashboard {
  period: { key: ReportPeriod; from: string; to: string };
  previous: { from: string; to: string };
  total_clients: number;
  new_clients: { count: number; previous: number; change: Change };
  clients_with_active_orders: number;
  active_orders: number;
  orders: { current: OrderTotals; previous: OrderTotals; count_change: Change; amount_change: Change };
  orders_by_type: { order_type: OrderType; label: string; count: number; total_amount: string }[];
  series: { interval: "day" | "week" | "month"; points: { start: string; count: number; total_amount: string }[] };
}

export const reportsApi = {
  dashboard: (query: QueryParams, signal?: AbortSignal) => api.get<ReportsDashboard>("reports/dashboard", query, signal),
};

export const reportsKeys = {
  all: ["reports"] as const,
  dashboard: (query: object) => ["reports", "dashboard", query] as const,
};
