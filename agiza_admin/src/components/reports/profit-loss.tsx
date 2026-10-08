"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DollarSign, Download, Package, Ship, TrendingDown, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ORDER_TYPES, formatDay, formatMillions, th } from "@/components/finance/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TableSkeletonRows } from "@/components/ui/table";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys, type ProfitLossFigures } from "@/lib/api/services/finance";
import { cn } from "@/lib/cn";
import { formatDate, formatTSh } from "@/lib/format";

type Preset = "this_month" | "last_month" | "this_year" | "all" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

const DEFAULTS = { preset: "this_month", from: "", to: "", order_type: "all", search: "", customer: "", customer_name: "", page: "1" };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Local-date range of a preset ("" = open-ended). */
function presetRange(preset: string, from: string, to: string): { date_from: string; date_to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month":
      return { date_from: ymd(new Date(y, m, 1)), date_to: ymd(now) };
    case "last_month":
      return { date_from: ymd(new Date(y, m - 1, 1)), date_to: ymd(new Date(y, m, 0)) };
    case "this_year":
      return { date_from: ymd(new Date(y, 0, 1)), date_to: ymd(now) };
    case "custom":
      return { date_from: from, date_to: to };
    default:
      return { date_from: "", date_to: "" };
  }
}

const marginText = (margin: string | null) => (margin === null ? "—" : `${Number(margin).toFixed(1)}%`);
const isLoss = (value: string | null | undefined) => Number(value ?? 0) < 0;

/** Profit & loss per order (total − purchase cost − shipping cost), a tab of Reporting & Audit Logs. */
export function ProfitLossTab() {
  const [f, setF] = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const range = presetRange(f.preset, f.from, f.to);
  const filters = { ...range, order_type: f.order_type, search: f.search, customer: f.customer };
  const query = { ...filters, page: Number(f.page) || 1, page_size: 20 };
  const report = useQuery({
    queryKey: financeKeys.profitLoss(query),
    queryFn: ({ signal }) => financeApi.profitLoss.get(query, signal),
    placeholderData: keepPreviousData,
  });
  const data = report.data;
  const totals = data?.totals;
  const loading = !totals && !report.isError;

  const [downloading, setDownloading] = useState(false);
  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const res = await fetch(financeApi.profitLoss.csvUrl(filters), { credentials: "same-origin" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Download failed (${res.status}).`);
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "profit-loss.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  const money = (value: string | undefined) =>
    value === undefined ? "—" : <span title={formatTSh(value)}>{formatMillions(value)}</span>;

  return (
    <>
      {/* Period + filters */}
      <Card className="p-6 mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
            <PillTabs<Preset>
              value={f.preset as Preset}
              onChange={(p) => setF({ preset: p, ...(p === "custom" ? range : { from: "", to: "" }) })}
              options={PRESETS}
            />
            <Button variant="success" onClick={downloadCsv} loading={downloading}>
              {!downloading && <Download className="size-4" />}
              Download CSV
            </Button>
          </div>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center flex-wrap">
            <SearchInput
              placeholder="Search order or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search orders"
            />
            <Select className="w-auto" aria-label="Filter by order type" value={f.order_type} onChange={(e) => setF({ order_type: e.target.value })}>
              <option value="all">All Order Types</option>
              {ORDER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            {f.preset === "custom" && (
              <div className="flex items-center gap-2">
                <Input type="date" className="w-auto" aria-label="From date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ from: e.target.value })} />
                <span className="text-gray-500 text-sm">to</span>
                <Input type="date" className="w-auto" aria-label="To date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ to: e.target.value })} />
              </div>
            )}
            {f.customer && (
              <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-3 py-1 text-sm">
                Customer: {f.customer_name || `#${f.customer}`}
                <button type="button" onClick={() => setF({ customer: "", customer_name: "" })} aria-label="Clear customer filter" className="hover:text-blue-950">
                  <X className="size-4" />
                </button>
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {range.date_from || range.date_to
              ? `Orders created ${range.date_from ? `from ${formatDay(range.date_from)}` : ""} ${range.date_to ? `to ${formatDay(range.date_to)}` : ""}.`
              : "All orders."}{" "}
            Profit = order total − purchase cost − shipping cost. Cancelled and unpriced orders are excluded.
          </p>
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard label={`Revenue${totals ? ` · ${totals.orders} orders` : ""}`} value={money(totals?.revenue)} icon={DollarSign} tone="blue" loading={loading} compactValue />
        <StatCard label="Purchase Cost" value={money(totals?.purchase_cost)} icon={Package} tone="orange" loading={loading} compactValue />
        <StatCard label="Shipping Cost" value={money(totals?.shipping_cost)} icon={Ship} tone="cyan" loading={loading} compactValue />
        <StatCard
          label="Profit"
          value={
            totals ? (
              <span className="flex items-baseline gap-2">
                <span title={formatTSh(totals.profit)}>{formatMillions(totals.profit)}</span>
                <span className="text-sm font-semibold">{marginText(totals.margin)}</span>
              </span>
            ) : "—"
          }
          icon={totals && isLoss(totals.profit) ? TrendingDown : TrendingUp}
          tone={totals && isLoss(totals.profit) ? "red" : "green"}
          loading={loading}
          compactValue
        />
      </div>

      {/* Per order type */}
      {data && data.by_type.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">By Order Type</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Order Type", "Orders", "Revenue", "Purchase Cost", "Shipping Cost", "Profit", "Margin"].map((h) => (
                    <th key={h} scope="col" className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.by_type.map((t) => (
                  <TypeRow key={t.order_type} label={t.order_type_display} figures={t} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Orders */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Orders</h2>
        </div>
        {report.isError && !data ? (
          <ErrorState bare message={errorText(report.error)} onRetry={() => report.refetch()} />
        ) : data && data.results.length === 0 ? (
          <EmptyState bare icon={TrendingUp} title="No orders in this period" description="Try another period or adjust your filters" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Order ID", "Customer", "Type", "Status", "Total", "Purchase Cost", "Shipping Cost", "Profit"].map((h) => (
                      <th key={h} scope="col" className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {!data ? (
                    <TableSkeletonRows columns={8} />
                  ) : (
                    data.results.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 whitespace-nowrap">{o.reference}</div>
                          <div className="text-xs text-gray-500">{formatDate(o.date)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => setF({ customer: String(o.customer.id), customer_name: o.customer.full_name })}
                            className="text-left text-gray-900 hover:text-blue-700 hover:underline"
                            title="Show only this customer's orders"
                          >
                            {o.customer.full_name}
                          </button>
                          <div className="text-xs text-gray-500 max-w-xs truncate" title={o.item_details}>{o.item_details}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{o.order_type_display}</td>
                        <td className="px-6 py-4 text-gray-700 text-sm whitespace-nowrap">{o.status_display}</td>
                        <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">{formatTSh(o.total)}</td>
                        <td className="px-6 py-4 text-gray-900 whitespace-nowrap">
                          {formatTSh(o.purchase_cost)}
                          <div className="text-xs text-gray-500">{o.purchase_cost_set ? "Manual" : "Automatic"}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-900 whitespace-nowrap">
                          {formatTSh(o.shipping_cost)}
                          <div className="text-xs text-gray-500">{o.shipping_cost_set ? "Manual" : "Automatic"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={cn("font-semibold", isLoss(o.profit) ? "text-red-600" : "text-green-600")}>{formatTSh(o.profit)}</div>
                          <div className="text-xs text-gray-500">{marginText(o.margin)}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data && data.total_pages > 1 && (
              <Pagination page={data.page} pageSize={data.page_size} count={data.count} totalPages={data.total_pages} onPageChange={(p) => setF({ page: String(p) })} disabled={report.isFetching} />
            )}
          </>
        )}
      </Card>
    </>
  );
}

function TypeRow({ label, figures }: { label: string; figures: ProfitLossFigures }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{label}</td>
      <td className="px-6 py-4 text-gray-900">{figures.orders}</td>
      <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{formatTSh(figures.revenue)}</td>
      <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{formatTSh(figures.purchase_cost)}</td>
      <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{formatTSh(figures.shipping_cost)}</td>
      <td className={cn("px-6 py-4 font-semibold whitespace-nowrap", isLoss(figures.profit) ? "text-red-600" : "text-green-600")}>{formatTSh(figures.profit)}</td>
      <td className="px-6 py-4 text-gray-700">{marginText(figures.margin)}</td>
    </tr>
  );
}
