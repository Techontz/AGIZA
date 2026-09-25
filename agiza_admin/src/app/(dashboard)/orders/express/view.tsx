"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, Package, Package2, User } from "lucide-react";
import React, { useEffect, useState } from "react";

import { ExpressRowDetails } from "@/components/orders/express/row-details";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/cn";
import { orderKeys, ordersApi, type ExpressOrder } from "@/lib/api/services/orders";
import { formatDateTime, formatTSh } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

const STAGE_BADGE: Record<string, [string, string]> = {
  in_progress: ["bg-blue-100 text-blue-800", "In Progress"],
  quoted: ["bg-green-100 text-green-800", "Quoted"],
  waiting_quote: ["bg-orange-100 text-orange-800", "Waiting Quote"],
  cancelled: ["bg-gray-100 text-gray-800", "Cancelled"],
};
const DETAIL_BADGE: Record<string, string> = {
  driver_assigned: "bg-gray-100 text-gray-800",
  picked_up: "bg-cyan-100 text-cyan-800",
  at_agiza_center: "bg-purple-100 text-purple-800",
  in_transit: "bg-blue-100 text-blue-800",
  arrived: "bg-indigo-100 text-indigo-800",
  delivered: "bg-green-100 text-green-800",
  quoted: "bg-yellow-100 text-yellow-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};
const PRIORITY_BADGE: Record<string, string> = {
  standard: "bg-gray-100 text-gray-800",
  express: "bg-purple-100 text-purple-800",
  urgent: "bg-red-100 text-red-800",
};
const pill = "px-3 py-1 rounded-full text-xs font-medium inline-block w-fit";
const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider";
type Tab = "all" | "in_progress" | "quoted" | "waiting_quote";

export function ExpressView() {
  const meta = pageMeta["/orders/express"];
  const [f, setF] = useUrlFilters({ tab: "all", search: "", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const query = { stage: f.tab === "all" ? undefined : f.tab, search: f.search, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: orderKeys.list("express", query),
    queryFn: ({ signal }) => ordersApi.express.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: orderKeys.stats("express"), queryFn: ordersApi.express.stats });
  const expanded = f.open ? Number(f.open) : null;
  const rows = list.data?.results ?? [];

  return (
    <PageContainer>
      <PageHeader title={meta.title} description={meta.description} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="In Progress" value={stats.data?.in_progress} icon={Package} tone="blue" loading={!stats.data} />
        <StatCard label="Quoted" value={stats.data?.quoted} icon={CheckCircle2} tone="green" loading={!stats.data} />
        <StatCard label="Waiting Quote" value={stats.data?.waiting_quote} icon={Clock} tone="orange" loading={!stats.data} />
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <SearchInput
            placeholder="Search by Order ID, Customer, or Item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search express orders"
          />
          <PillTabs<Tab>
            value={f.tab as Tab}
            onChange={(tab) => setF({ tab, open: "" })}
            options={[
              { value: "all", label: "All Orders" },
              { value: "in_progress", label: "In Progress" },
              { value: "quoted", label: "Quoted" },
              { value: "waiting_quote", label: "Waiting Quote" },
            ]}
          />
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Package2 className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No deliveries found</p>
          <p className="text-gray-500 text-sm mt-2">Try adjusting your filters or search terms</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Order ID", "Customer", "Item Details", "Status", "Priority", "Price", "Actions"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.isPending
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 rounded bg-gray-200 animate-pulse" />
                            {j === 0 && <div className="mt-2 h-3 w-24 rounded bg-gray-100 animate-pulse" />}
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((order) => <Row key={order.id} order={order} open={expanded === order.id} toggle={() => setF({ open: expanded === order.id ? "" : String(order.id) })} />)}
              </tbody>
            </table>
          </div>
          {list.data && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={(p) => setF({ page: String(p), open: "" })}
              disabled={list.isFetching}
            />
          )}
        </Card>
      )}
    </PageContainer>
  );
}

function Row({ order, open, toggle }: { order: ExpressOrder; open: boolean; toggle: () => void }) {
  const [stageClass, stageLabel] = STAGE_BADGE[order.stage];
  const showDetail = order.stage === "in_progress" || order.stage === "quoted";
  return (
    <React.Fragment>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <div className="font-semibold text-gray-900 whitespace-nowrap">{order.reference}</div>
          <div className="text-xs text-gray-500">{formatDateTime(order.created_at)}</div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <User className="size-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-900">{order.customer.full_name}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="text-gray-900">{order.item_details}</div>
        </td>
        <td className="px-6 py-4">
          <div className="flex flex-col gap-1">
            <span className={cn(pill, stageClass)}>{stageLabel}</span>
            {showDetail && DETAIL_BADGE[order.status] && (
              <span className={cn(pill, DETAIL_BADGE[order.status])}>{order.status_display}</span>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <span className={cn("px-2 py-1 rounded text-xs font-medium", PRIORITY_BADGE[order.details.priority])}>
            {order.details.priority.toUpperCase()}
          </span>
        </td>
        <td className="px-6 py-4">
          {order.total_amount ? (
            <div className="text-gray-900 font-medium whitespace-nowrap">{formatTSh(order.total_amount)}</div>
          ) : (
            <span className="text-gray-500 text-sm">Pending</span>
          )}
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${order.reference}`}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {open ? "Less" : "Details"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="px-6 py-4 bg-gray-50">
            <ExpressRowDetails order={order} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}
