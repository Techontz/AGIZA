"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Activity, DollarSign, Package, ShoppingBag, UserPlus, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { reportsApi, reportsKeys, type Change, type ReportPeriod, type ReportsDashboard } from "@/lib/api/services/reports";
import { cn } from "@/lib/cn";
import { formatTSh } from "@/lib/format";

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

/** yyyy-mm-dd → Date at local midnight (no timezone shift). */
const day = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtDay = (value: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) =>
  day(value).toLocaleDateString("en-US", opts);

/** "TSh 12.3M" / "TSh 450K" for card values; the exact amount is in the tooltip. */
function compactTSh(value: string | number): string {
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000) return `TSh ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `TSh ${(n / 1_000).toFixed(0)}K`;
  return formatTSh(n);
}

/** Green ▲ / red ▼ change vs the previous period. */
export function ChangeBadge({ change }: { change: Change }) {
  const { percent, direction } = change;
  const text = percent === null ? "New" : `${Math.abs(percent).toFixed(1)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        direction === "up" && "bg-green-100 text-green-700",
        direction === "down" && "bg-red-100 text-red-700",
        direction === "flat" && "bg-gray-100 text-gray-600",
      )}
      title="Compared with the previous period"
    >
      {direction === "up" ? "▲" : direction === "down" ? "▼" : "–"} {text}
      <span className="sr-only">{direction === "up" ? "increase" : direction === "down" ? "decrease" : "no change"}</span>
    </span>
  );
}

function WithChange({ value, change, title }: { value: React.ReactNode; change: Change; title?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span title={title}>{value}</span>
      <ChangeBadge change={change} />
    </span>
  );
}

export function ReportsDashboardTab() {
  const [f, setF] = useUrlFilters({ period: "30d", from: "", to: "" });
  const period = (PERIODS.some((p) => p.value === f.period) ? f.period : "30d") as ReportPeriod;
  const customReady = period !== "custom" || (Boolean(f.from) && Boolean(f.to) && f.from <= f.to);
  const query = period === "custom" ? { period, date_from: f.from, date_to: f.to } : { period };

  const report = useQuery({
    queryKey: reportsKeys.dashboard(query),
    queryFn: ({ signal }) => reportsApi.dashboard(query, signal),
    placeholderData: keepPreviousData,
    enabled: customReady,
  });
  const d = report.data;
  const loading = !d && !report.isError;

  return (
    <>
      <Card className="p-6 mb-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <PillTabs<ReportPeriod>
            value={period}
            onChange={(p) => setF(p === "custom" && d ? { period: p, from: d.period.from, to: d.period.to } : { period: p, from: "", to: "" })}
            options={PERIODS}
          />
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <Input type="date" className="w-auto" aria-label="From date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ from: e.target.value })} />
              <span className="text-gray-500 text-sm">to</span>
              <Input type="date" className="w-auto" aria-label="To date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ to: e.target.value })} />
            </div>
          )}
        </div>
        {d && (
          <p className="text-xs text-gray-500 mt-3">
            {fmtDay(d.period.from)} – {fmtDay(d.period.to)}, compared with {fmtDay(d.previous.from)} – {fmtDay(d.previous.to)}.
            Cancelled orders are not counted.
          </p>
        )}
        {!customReady && <p className="text-xs text-gray-500 mt-3">Pick a start and an end date.</p>}
      </Card>

      {report.isError && !d ? (
        <ErrorState message={errorText(report.error)} onRetry={() => report.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
            <StatCard label="Total Clients" value={d?.total_clients.toLocaleString() ?? "—"} icon={Users} tone="blue" loading={loading} />
            <StatCard
              label="New Clients"
              value={d ? <WithChange value={d.new_clients.count.toLocaleString()} change={d.new_clients.change} title={`Previous period: ${d.new_clients.previous}`} /> : "—"}
              icon={UserPlus}
              tone="indigo"
              loading={loading}
            />
            <StatCard label="Clients with Active Orders" value={d?.clients_with_active_orders.toLocaleString() ?? "—"} icon={Activity} tone="purple" loading={loading} />
            <StatCard label="Active Orders" value={d?.active_orders.toLocaleString() ?? "—"} icon={Package} tone="orange" loading={loading} />
            <StatCard
              label="Orders in Period"
              value={d ? <WithChange value={d.orders.current.count.toLocaleString()} change={d.orders.count_change} title={`Previous period: ${d.orders.previous.count}`} /> : "—"}
              icon={ShoppingBag}
              tone="green"
              loading={loading}
            />
            <StatCard
              label="Order Value in Period"
              value={
                d ? (
                  <WithChange
                    value={compactTSh(d.orders.current.total_amount)}
                    change={d.orders.amount_change}
                    title={`${formatTSh(d.orders.current.total_amount)} (previous period: ${formatTSh(d.orders.previous.total_amount)})`}
                  />
                ) : "—"
              }
              icon={DollarSign}
              tone="cyan"
              loading={loading}
              compactValue
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className="p-6 xl:col-span-2">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Orders Over Time</h2>
              <p className="text-sm text-gray-500 mb-4">Orders per {d?.series.interval ?? "day"}</p>
              {d ? <OrdersChart series={d.series} /> : <Skeleton className="h-56" />}
            </Card>
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Orders by Type</h2>
              {d ? <TypeBreakdown rows={d.orders_by_type} /> : <Skeleton className="h-56" />}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function bucketLabel(start: string, interval: ReportsDashboard["series"]["interval"]): string {
  if (interval === "month") return fmtDay(start, { month: "short", year: "numeric" });
  return fmtDay(start, { month: "short", day: "numeric" });
}

/** Plain CSS bar chart (one bar per bucket, a few x labels, exact values in tooltips). */
function OrdersChart({ series }: { series: ReportsDashboard["series"] }) {
  const points = series.points;
  const max = Math.max(1, ...points.map((p) => p.count));
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const total = points.reduce((sum, p) => sum + p.count, 0);

  if (total === 0) {
    return <div className="h-56 flex items-center justify-center text-sm text-gray-500 bg-gray-50 rounded-lg">No orders in this period</div>;
  }

  return (
    <figure aria-label={`Orders per ${series.interval}`}>
      <div className="flex gap-3">
        <div className="flex flex-col justify-between h-48 text-xs text-gray-400 text-right tabular-nums" aria-hidden>
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-48 flex items-end gap-[2px] border-b border-l border-gray-200">
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-100" aria-hidden />
            {points.map((p) => {
              const label = `${bucketLabel(p.start, series.interval)}: ${p.count} order${p.count === 1 ? "" : "s"}, ${formatTSh(p.total_amount)}`;
              return (
                <div key={p.start} className="group relative flex-1 h-full flex items-end" title={label}>
                  <div
                    className="w-full rounded-t-sm bg-blue-500 group-hover:bg-blue-700 transition-colors"
                    style={{ height: `${(p.count / max) * 100}%`, minHeight: p.count ? 2 : 0 }}
                  />
                  <span className="sr-only">{label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-[2px] mt-2" aria-hidden>
            {points.map((p, i) => (
              <div key={p.start} className="flex-1 min-w-0 text-[10px] text-gray-500 text-center whitespace-nowrap overflow-visible">
                {i % labelEvery === 0 ? bucketLabel(p.start, series.interval) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function TypeBreakdown({ rows }: { rows: ReportsDashboard["orders_by_type"] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.order_type}>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
            <span className="font-medium text-gray-900">{r.label}</span>
            <span className="text-gray-600 tabular-nums">
              {r.count} · <span title={formatTSh(r.total_amount)}>{compactTSh(r.total_amount)}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
