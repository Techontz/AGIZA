"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, MapPin, Plus, Store, Truck, User, Warehouse, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";

import { useDeliveryAccess } from "@/components/deliveries/access";
import { DeliveryExceptionBadge, DeliveryStatusBadge, DeliveryTypeBadge, OrderSourceBadge } from "@/components/deliveries/badges";
import { NewDeliveryDialog } from "@/components/deliveries/new-delivery-dialog";
import { PickupsPanel } from "@/components/deliveries/pickups";
import { DeliveryRowDetails } from "@/components/deliveries/row-details";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { PillTabs, UnderlineTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { deliveriesApi, deliveryKeys, type Delivery } from "@/lib/api/services/deliveries";
import { pageMeta } from "@/lib/nav";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";
const select = "w-auto bg-white";
const COLUMNS = [
  "Delivery ID",
  "Order ID",
  "Order Source",
  "Customer",
  "Pickup/Delivery Point",
  "Destination",
  "Delivery Type",
  "Assigned Driver",
  "Status",
  "Exception Flag",
  "Actions",
];
const STATUS_OPTIONS: Record<Tab, [string, string][]> = {
  pending: [
    ["pending", "Pending"],
    ["assigned_driver", "Assigned Driver"],
    ["out_for_delivery", "Out for Delivery"],
    ["rescheduled", "Rescheduled"],
  ],
  completed: [
    ["delivered", "Delivered"],
    ["failed", "Failed"],
    ["returned", "Returned"],
    ["cancelled", "Cancelled"],
  ],
};
type Tab = "pending" | "completed";

export function DeliveriesView() {
  const meta = pageMeta["/deliveries"];
  const { canManage, isDriver } = useDeliveryAccess();
  const [f, setF] = useUrlFilters({
    view: "deliveries",
    tab: "pending",
    search: "",
    driver: "all",
    status: "all",
    source: "all",
    page: "1",
    open: "",
    // Pickups view (collections from sellers), kept separate from the delivery filters.
    psearch: "",
    pstatus: "all",
    pvendor: "all",
    pdriver: "all",
    ppage: "",
    popen: "",
  });
  const view = f.view === "pickups" ? "pickups" : "deliveries";
  const [search, setSearch] = useState(f.search);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced, open: "" });
  }, [debounced, f.search, setF]);

  const tab = (f.tab === "completed" ? "completed" : "pending") as Tab;
  const query = { tab, search: f.search, driver: f.driver, status: f.status, source: f.source, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: deliveryKeys.list(query),
    queryFn: ({ signal }) => deliveriesApi.list(query, signal),
    placeholderData: keepPreviousData,
    enabled: view === "deliveries",
  });
  const stats = useQuery({ queryKey: deliveryKeys.stats, queryFn: deliveriesApi.stats });
  const drivers = useQuery({ queryKey: deliveryKeys.drivers, queryFn: deliveriesApi.drivers, enabled: !isDriver, staleTime: 60_000 });
  const rows = list.data?.results ?? [];
  const expanded = f.open ? Number(f.open) : null;
  const s = stats.data;

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          canManage &&
          view === "deliveries" && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-5" /> New Delivery
            </Button>
          )
        }
      />

      <UnderlineTabs
        className="mb-6"
        value={view}
        onChange={(v) => setF({ view: v })}
        options={[
          { value: "deliveries", label: <><Truck className="size-4" /> Deliveries</> },
          { value: "pickups", label: <><Store className="size-4" /> Pickups from Sellers</> },
        ]}
      />

      {view === "pickups" ? (
        <PickupsPanel f={f} setF={setF} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <StatCard label="Pending Deliveries" value={s?.pending} icon={Clock} tone="blue" loading={!s} />
            <StatCard label="Out for Delivery" value={s?.out_for_delivery} icon={Truck} tone="purple" loading={!s} />
            <StatCard label="Delivered Today" value={s?.delivered_today} icon={CheckCircle2} tone="green" loading={!s} />
            <StatCard label="Failed/Issues" value={s?.failed_issues} icon={XCircle} tone="red" loading={!s} />
          </div>
          {stats.isError && (
            <p className="-mt-6 mb-6 text-sm text-red-600" role="alert">
              Couldn&apos;t load delivery totals: {errorText(stats.error)}{" "}
              <button type="button" className="font-medium text-blue-600 hover:text-blue-800" onClick={() => stats.refetch()}>
                Retry
              </button>
            </p>
          )}

          <Card className="p-6 mb-6">
            <div className="mb-4">
              <PillTabs<Tab>
                value={tab}
                onChange={(t) => setF({ tab: t, status: "all", open: "" })}
                options={[
                  { value: "pending", label: `Pending Deliveries (${s?.pending ?? "…"})` },
                  { value: "completed", label: `Completed/Failed (${s?.completed ?? "…"})` },
                ]}
              />
            </div>
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between pt-4 border-t border-gray-200">
              <SearchInput
                placeholder="Search by Delivery ID, Order ID, or Customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search deliveries"
              />
              <div className="flex gap-3 flex-wrap">
                {!isDriver && (
                  <Select className={select} aria-label="Filter by driver" value={f.driver} onChange={(e) => setF({ driver: e.target.value, open: "" })}>
                    <option value="all">All Drivers</option>
                    {drivers.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name}
                      </option>
                    ))}
                  </Select>
                )}
                <Select className={select} aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value, open: "" })}>
                  <option value="all">All Statuses</option>
                  {STATUS_OPTIONS[tab].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
                <Select className={select} aria-label="Filter by order source" value={f.source} onChange={(e) => setF({ source: e.target.value, open: "" })}>
                  <option value="all">All Order Sources</option>
                  <option value="international">International</option>
                  <option value="shop">Shop</option>
                  <option value="local_delivery">Local Delivery</option>
                </Select>
              </div>
            </div>
          </Card>

          {list.isError && !list.data ? (
            <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
          ) : !list.isPending && rows.length === 0 ? (
            <Card className="p-12 text-center">
              <Truck className="size-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No deliveries found</p>
              <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {COLUMNS.map((h) => (
                        <th key={h} scope="col" className={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {list.isPending
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i}>
                            {COLUMNS.map((c) => (
                              <td key={c} className="px-6 py-4">
                                <div className="h-4 rounded bg-gray-200 animate-pulse" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : rows.map((d) => (
                          <Row key={d.id} delivery={d} open={expanded === d.id} toggle={() => setF({ open: expanded === d.id ? "" : String(d.id) })} />
                        ))}
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

        </>
      )}

      <NewDeliveryDialog open={creating} onClose={() => setCreating(false)} onCreated={(d) => setF({ tab: "pending", status: "all", search: "", open: String(d.id) })} />
    </PageContainer>
  );
}

function Row({ delivery: d, open, toggle }: { delivery: Delivery; open: boolean; toggle: () => void }) {
  const pickup = d.pickup_point || d.pickup_warehouse?.name;
  return (
    <React.Fragment>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <div className="font-semibold text-gray-900 whitespace-nowrap">{d.reference}</div>
        </td>
        <td className="px-6 py-4">
          <div className="text-gray-900 whitespace-nowrap">{d.order.reference}</div>
        </td>
        <td className="px-6 py-4">
          <OrderSourceBadge source={d.source} label={d.source_display} />
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <User className="size-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-900 whitespace-nowrap">{d.customer.full_name}</span>
          </div>
        </td>
        {/* Pickup/Delivery Point (the prototype had this swapped with Destination). */}
        <td className="px-6 py-4">
          <div className="space-y-1 min-w-48 max-w-xs">
            {pickup && (
              <div className="flex items-center gap-2" title="Pickup point">
                <Warehouse className="size-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-900">{pickup}</span>
              </div>
            )}
            <div className="flex items-center gap-2" title="Delivery point">
              <MapPin className="size-4 text-gray-400 flex-shrink-0" />
              <span className={pickup ? "text-sm text-gray-600" : "text-gray-900"}>{d.delivery_address}</span>
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-gray-400 flex-shrink-0" />
            <div>
              <div className="text-gray-900 font-medium whitespace-nowrap">{d.destination_city?.name ?? "—"}</div>
              {d.destination_area && <div className="text-xs text-gray-500">{d.destination_area}</div>}
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <DeliveryTypeBadge type={d.delivery_type} label={d.delivery_type_display} />
        </td>
        <td className="px-6 py-4">
          {d.driver ? <div className="text-gray-900 whitespace-nowrap">{d.driver.full_name}</div> : <span className="text-sm text-gray-500 italic">Unassigned</span>}
        </td>
        <td className="px-6 py-4">
          <DeliveryStatusBadge delivery={d} />
        </td>
        <td className="px-6 py-4">
          <DeliveryExceptionBadge flag={d.exception_flag} />
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${d.reference}`}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {open ? "Less" : "Details"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={COLUMNS.length} className="px-6 py-4 bg-gray-50">
            <DeliveryRowDetails delivery={d} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}
