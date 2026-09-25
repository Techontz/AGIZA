"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertCircle, Calendar, CheckCircle2, ChevronRight, Clock4, Filter, History, MapPin, Search, User, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";

import { EquipmentDetailModal } from "@/components/orders/equipment/detail-modal";
import { NewRequestDialog } from "@/components/orders/equipment/new-request-dialog";
import { CLASS_ICON, PAYMENT_TEXT, SERVICE_STYLE, STATUS_COLOR, shortDateTime, titleCaseClass } from "@/components/orders/equipment/shared";
import { useOrderAccess, useOrderMutation } from "@/components/orders/shared";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/cn";
import { orderKeys, ordersApi, type EquipmentOrder } from "@/lib/api/services/orders";

const STAT_STYLE = {
  blue: "bg-blue-50 text-blue-600",
  orange: "bg-orange-50 text-orange-600",
  purple: "bg-purple-50 text-purple-600",
  red: "bg-red-50 text-red-600",
};
type Tab = "all" | "attention" | "progress" | "completed";
const th = "px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap";

export function EquipmentView() {
  const { canEdit } = useOrderAccess();
  const [f, setF] = useUrlFilters({ tab: "all", search: "", service_type: "all", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);
  const [showFilter, setShowFilter] = useState(f.service_type !== "all");
  const [creating, setCreating] = useState(false);

  const query = { tab: f.tab === "all" ? undefined : f.tab, search: f.search, service_type: f.service_type, page: Number(f.page), page_size: 20 };
  const list = useQuery({ queryKey: orderKeys.list("equipment", query), queryFn: ({ signal }) => ordersApi.equipment.list(query, signal), placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: orderKeys.stats("equipment"), queryFn: ordersApi.equipment.stats });
  const openId = f.open ? Number(f.open) : null;
  const openOrder = useQuery({ queryKey: orderKeys.one("equipment", openId ?? 0), queryFn: () => ordersApi.equipment.get(openId!), enabled: Boolean(openId) });
  const rows = list.data?.results ?? [];
  const s = stats.data;

  const statCards = [
    { label: "Active Requests", value: s?.active, icon: Clock4, color: "blue" as const },
    { label: "Pending Approval", value: s?.pending_approval, icon: AlertCircle, color: "orange" as const },
    { label: "In Progress", value: s?.in_progress, icon: Wrench, color: "purple" as const },
    { label: "Maintenance Alerts", value: s?.maintenance_alerts, icon: AlertCircle, color: "red" as const },
  ];
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "All Requests" },
    { id: "attention", label: "Needs Attention", count: s?.maintenance_alerts },
    { id: "progress", label: "In Progress" },
    { id: "completed", label: "Completed" },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Equipment Support Orders</h1>
            <p className="text-gray-600">Installation, Setup, Maintenance, and Repairs Management</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setF({ tab: f.tab === "completed" ? "all" : "completed" })}
              aria-pressed={f.tab === "completed"}
              className={cn("flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm font-medium hover:bg-gray-50", f.tab === "completed" ? "border-blue-300 text-blue-700" : "border-gray-200 text-gray-700")}
            >
              <History className="size-4" />
              History
            </button>
            {canEdit && (
              <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">
                <Wrench className="size-4" />
                New Support Request
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium mb-1">{stat.label}</p>
                  {stat.value === undefined ? <div className="h-9 w-12 rounded bg-gray-200 animate-pulse" /> : <p className="text-3xl font-bold text-gray-900">{stat.value}</p>}
                </div>
                <div className={cn("p-3 rounded-xl", STAT_STYLE[stat.color])}>
                  <stat.icon className="size-6" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
          <div className="border-b border-gray-200 px-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <div className="flex gap-8 overflow-x-auto no-scrollbar" role="tablist">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={f.tab === tab.id}
                    onClick={() => setF({ tab: tab.id })}
                    className={cn("py-4 text-sm font-medium relative transition-colors whitespace-nowrap", f.tab === tab.id ? "text-blue-600" : "text-gray-500 hover:text-gray-700")}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">{tab.count}</span>}
                    {f.tab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 py-2">
                <div className="relative group flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 group-focus-within:text-blue-500" />
                  <input
                    type="search"
                    placeholder="Search orders, customers..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search equipment orders"
                    className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full lg:w-64"
                  />
                </div>
                <button type="button" onClick={() => setShowFilter((v) => !v)} aria-label="Filter" aria-expanded={showFilter} className={cn("p-2 border rounded-lg hover:bg-gray-50", f.service_type !== "all" ? "border-blue-300 text-blue-600" : "border-gray-200 text-gray-500")}>
                  <Filter className="size-4" />
                </button>
              </div>
            </div>
            {showFilter && (
              <div className="flex items-center gap-3 pb-3">
                <label htmlFor="eq-service" className="text-sm text-gray-500">Service type</label>
                <select id="eq-service" value={f.service_type} onChange={(e) => setF({ service_type: e.target.value })} className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="all">All service types</option>
                  <option value="installation">Installation</option>
                  <option value="product_setup">Product Setup</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="electronic_repair">Electronic Repair</option>
                </select>
                {f.service_type !== "all" && (
                  <button type="button" onClick={() => setF({ service_type: "all" })} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"><X className="size-3.5" /> Clear</button>
                )}
              </div>
            )}
          </div>

          {list.isError && !list.data ? (
            <ErrorState bare message={(list.error as Error).message} onRetry={() => list.refetch()} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className={th}>Order ID &amp; Type</th>
                    <th className={th}>Classification</th>
                    <th className={th}>Customer &amp; Location</th>
                    <th className={th}>Handler</th>
                    <th className={th}>Status</th>
                    <th className={th}>Expected Date</th>
                    <th className={th}>Payment</th>
                    <th className={cn(th, "text-right sticky right-0 bg-gray-50")}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list.isPending
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 8 }).map((__, j) => <td key={j} className="px-6 py-4"><div className="h-4 rounded bg-gray-100 animate-pulse" /></td>)}</tr>
                      ))
                    : rows.map((o) => <Row key={o.id} order={o} onOpen={() => setF({ open: String(o.id) })} canEdit={canEdit} />)}
                  {list.data && rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <Wrench className="size-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600">No support requests found</p>
                        <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search terms</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setF({ page: String(p) })} disabled={list.isFetching} />
          )}
        </div>
      </div>

      {openOrder.data && <EquipmentDetailModal order={openOrder.data} onClose={() => setF({ open: "" })} />}
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => setF({ open: String(id) })} />
    </div>
  );
}

function Row({ order, onOpen, canEdit }: { order: EquipmentOrder; onOpen: () => void; canEdit: boolean }) {
  const d = order.details;
  const style = SERVICE_STYLE[d.service_type];
  const Icon = style.icon;
  const ClassIcon = CLASS_ICON[d.classification];
  const [payClass, payLabel] = PAYMENT_TEXT[order.payment.status];
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const save = useOrderMutation((value: string) => {
    // Keep the existing time of day (or 09:00) when only the date changes.
    const prev = d.expected_date ? new Date(d.expected_date) : null;
    const next = new Date(`${value}T${prev ? `${String(prev.getHours()).padStart(2, "0")}:${String(prev.getMinutes()).padStart(2, "0")}` : "09:00"}`);
    return ordersApi.equipment.expectedDate(order.id, next.toISOString());
  }, { success: "Service date updated", onSuccess: () => setEditing(false) });
  const closed = ["completed", "cancelled"].includes(order.status);

  return (
    <tr className="hover:bg-gray-50/80 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", style.box)}><Icon className="size-5" /></div>
          <div>
            <p className="text-sm font-bold text-gray-900 whitespace-nowrap">{order.reference}</p>
            <p className="text-xs text-gray-500">{d.service_type_display}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2 px-2.5 py-1 bg-gray-100 rounded-md w-fit">
          <span className="text-gray-500"><ClassIcon className="size-4" /></span>
          <span className="text-xs font-medium text-gray-700">{titleCaseClass(d.classification)}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="size-8 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">{order.customer.full_name.charAt(0)}</div>
          <div>
            <p className="text-sm font-medium text-gray-900">{order.customer.full_name}</p>
            <div className="flex items-center gap-1 text-xs text-gray-500"><MapPin className="size-3" />{d.city?.name ?? "—"}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="size-6 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center"><User className="size-3 text-blue-600" /></div>
          <span className="text-sm text-gray-600 font-medium whitespace-nowrap">{d.technician?.full_name ?? "Unassigned"}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap", STATUS_COLOR[order.status])}>{order.status_display}</span>
          {order.needs_attention && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-label="Needs attention" />}
        </div>
      </td>
      <td className="px-6 py-4">
        {editing ? (
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={`New date for ${order.reference}`} className="text-xs border border-gray-300 rounded p-1 focus:ring-1 focus:ring-blue-500" />
            <button type="button" onClick={() => date && save.mutate(date)} disabled={!date || save.isPending} className="text-blue-600 hover:text-blue-700 disabled:opacity-40" aria-label="Save date">
              <CheckCircle2 className="size-4" />
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600" aria-label="Cancel"><X className="size-4" /></button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!canEdit || closed}
            onClick={() => {
              setDate(d.expected_date ? d.expected_date.slice(0, 10) : "");
              setEditing(true);
            }}
            className="flex items-center gap-2 text-sm text-gray-600 group-hover:text-blue-600 transition-colors disabled:cursor-default disabled:group-hover:text-gray-600 whitespace-nowrap"
            title={canEdit && !closed ? "Click to change the service date" : undefined}
          >
            <Calendar className="size-4 opacity-40" />
            <span>{shortDateTime(d.expected_date)}</span>
          </button>
        )}
      </td>
      <td className="px-6 py-4"><span className={cn("text-sm", payClass)}>{payLabel}</span></td>
      {/* Stays visible while the wide table scrolls horizontally. */}
      <td className="px-6 py-4 text-right sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]">
        <button type="button" onClick={onOpen} aria-label={`Open ${order.reference}`} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-600 transition-colors">
          <ChevronRight className="size-5" />
        </button>
      </td>
    </tr>
  );
}
