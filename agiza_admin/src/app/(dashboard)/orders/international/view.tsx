"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Package2, User } from "lucide-react";
import { useEffect, useState } from "react";

import { DepartmentBadge, ORIGIN, OrderTypeBadge, OriginBadge, PaymentBadge, ServiceBadge, StatusBadge } from "@/components/orders/international/badges";
import { InternationalDetailsModal } from "@/components/orders/international/details-modal";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { orderKeys, ordersApi } from "@/lib/api/services/orders";
import { formatDate } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap";
const select = "w-auto bg-white";
const STATUS_OPTIONS = [
  ["pending_payment", "Pending Payment"], ["issue_pending_payment", "Issue - Pending Payment"],
  ["supplier_confirmed", "Supplier Confirmed"], ["paid_supplier", "Paid Supplier"], ["in_production", "In Production"], ["waiting_to_receive", "Waiting to Receive"],
  ["sent_to_consolidation", "Sent to Consolidation"], ["shipping_to_destination", "Shipping"], ["clearance", "Clearance"],
  ["ready_for_collection", "Ready for Collection"], ["completed", "Completed"],
];
type Tab = "active" | "attention" | "completed";

export function InternationalView() {
  const meta = pageMeta["/orders/international"];
  const [f, setF] = useUrlFilters({ tab: "active", search: "", origin: "all", handler: "all", status: "all", service_type: "all", department: "all", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const query = { tab: f.tab, search: f.search, origin: f.origin, handler: f.handler, status: f.status, service_type: f.service_type, department: f.department, page: Number(f.page), page_size: 20 };
  const list = useQuery({ queryKey: orderKeys.list("international", query), queryFn: ({ signal }) => ordersApi.international.list(query, signal), placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: orderKeys.stats("international"), queryFn: ordersApi.international.stats });
  const handlers = useQuery({ queryKey: ["orders", "assignees", "handler"], queryFn: () => ordersApi.international.assignees("handler") });
  const rows = list.data?.results ?? [];
  const openId = f.open ? Number(f.open) : null;
  const openOrder = useQuery({
    queryKey: orderKeys.one("international", openId ?? 0),
    queryFn: () => ordersApi.international.get(openId!),
    enabled: Boolean(openId),
  });
  const s = stats.data;

  return (
    <PageContainer>
      <PageHeader title={meta.title} description={meta.description} />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Active Orders" value={s?.active} icon={Package2} tone="blue" loading={!s} />
        <StatCard label="Needs Attention" value={s?.needs_attention} icon={AlertTriangle} tone="red" loading={!s} />
        <StatCard label="In Production" value={s?.in_production} icon={Clock} tone="purple" loading={!s} />
        <StatCard label="Completed" value={s?.completed} icon={CheckCircle2} tone="green" loading={!s} />
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <SearchInput placeholder="Search by Order ID, Customer, or Items..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search international orders" />
          <div className="flex gap-3 flex-wrap">
            <Select className={select} aria-label="Filter by origin" value={f.origin} onChange={(e) => setF({ origin: e.target.value })}>
              <option value="all">All Origins</option>
              {Object.entries(ORIGIN).map(([iso, [, l]]) => <option key={iso} value={iso}>{iso === "AE" ? "Dubai" : iso === "GB" ? "UK" : iso === "US" ? "USA" : l}</option>)}
            </Select>
            <Select className={select} aria-label="Filter by handler" value={f.handler} onChange={(e) => setF({ handler: e.target.value })}>
              <option value="all">All Handlers</option>
              {handlers.data?.map((h) => <option key={h.id} value={h.id}>{h.full_name}</option>)}
            </Select>
            <Select className={select} aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value })}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Select className={select} aria-label="Filter by service type" value={f.service_type} onChange={(e) => setF({ service_type: e.target.value })}>
              <option value="all">All Service Types</option>
              <option value="full_service">Full Service</option>
              <option value="deliver_for_me">Deliver for Me</option>
              <option value="local_purchase">Local Purchase</option>
              <option value="marketplace">Marketplace</option>
            </Select>
            <Select className={select} aria-label="Filter by department" value={f.department} onChange={(e) => setF({ department: e.target.value })}>
              <option value="all">All Departments</option>
              <option value="unassigned">Unassigned</option>
              <option value="procurement">Procurement</option>
              <option value="shipping">Shipping</option>
              <option value="delivery">Delivery</option>
            </Select>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <PillTabs<Tab>
            value={f.tab as Tab}
            onChange={(tab) => setF({ tab })}
            options={[
              { value: "active", label: `Active Orders (${s?.active ?? "…"})` },
              { value: "attention", label: <><AlertTriangle className="size-4" />Needs Attention ({s?.needs_attention ?? "…"})</>, activeClass: "bg-red-600" },
              { value: "completed", label: `Completed (${s?.completed ?? "…"})` },
            ]}
          />
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Package2 className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No orders found</p>
          <p className="text-gray-500 text-sm mt-2">Try adjusting your filters or search terms</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Order ID", "Customer", "Items Name", "Service Type", "Department", "Origin", "Status", "Order Type", "Payment Status", "Handler", "Actions"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.isPending
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 11 }).map((__, j) => <td key={j} className="px-6 py-4"><div className="h-4 rounded bg-gray-200 animate-pulse" /></td>)}</tr>
                    ))
                  : rows.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 whitespace-nowrap">{o.reference}</div>
                          <div className="text-xs text-gray-500">{formatDate(o.created_at)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2"><User className="size-4 text-gray-400 flex-shrink-0" /><span className="text-gray-900">{o.customer.full_name}</span></div>
                        </td>
                        <td className="px-6 py-4"><div className="text-gray-900 max-w-xs truncate" title={o.item_details}>{o.item_details}</div></td>
                        <td className="px-6 py-4"><ServiceBadge type={o.details.service_type} /></td>
                        <td className="px-6 py-4"><DepartmentBadge dept={o.department} /></td>
                        <td className="px-6 py-4"><OriginBadge iso2={o.details.source_country.iso2} /></td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <StatusBadge status={o.status} label={o.status_display} />
                            {o.needs_attention && (
                              <div className="flex items-center gap-1 text-red-600"><AlertTriangle className="size-3" /><span className="text-xs">Attention Required</span></div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4"><OrderTypeBadge type={o.details.order_class} /></td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <PaymentBadge status={o.payment.status} />
                            {o.payment.status === "installment" && !o.installment_allowed && <div className="text-xs text-red-600">⚠ Not Allowed</div>}
                          </div>
                        </td>
                        <td className="px-6 py-4"><div className="text-gray-900 text-sm whitespace-nowrap">{o.handler?.full_name ?? "Unassigned"}</div></td>
                        <td className="px-6 py-4">
                          <button type="button" onClick={() => setF({ open: String(o.id) })} className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors whitespace-nowrap">
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setF({ page: String(p) })} disabled={list.isFetching} />
          )}
        </Card>
      )}

      {openOrder.data && <InternationalDetailsModal order={openOrder.data} onClose={() => setF({ open: "" })} />}
    </PageContainer>
  );
}
