"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package2, PackageSearch, PackageX, Plus, Ship } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AddToShipmentModal } from "@/components/shipping/add-to-shipment-modal";
import { CreateShipmentModal } from "@/components/shipping/create-shipment-modal";
import { MarkLostModal, ReceiveModal } from "@/components/shipping/receive-modal";
import { STATUS_OPTIONS, useCarriers, useOriginCountries, useShippingAccess } from "@/components/shipping/shared";
import { DocumentsModal } from "@/components/shipping/shipment-dialogs";
import { ReadyTable, ShipmentsTable, WaitingTable } from "@/components/shipping/tables";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { shippingApi, shippingKeys, type Parcel } from "@/lib/api/services/shipping";
import { pageMeta } from "@/lib/nav";

type Tab = "ready" | "shipments" | "delivered" | "waiting" | "lost";
// Shipments still moving; finished ones are under Delivered.
const ACTIVE_STATUSES = STATUS_OPTIONS.map(([v]) => v).filter((v) => v !== "completed" && v !== "cancelled");
const select = "w-auto bg-white";
const PAGE_SIZE = 20;

export function ShippingView() {
  const meta = pageMeta["/shipping"];
  const { canEdit } = useShippingAccess();
  const [f, setF] = useUrlFilters({ tab: "shipments", search: "", shipper: "all", origin: "all", method: "all", status: "all", page: "1", open: "" });
  const tab = f.tab as Tab;
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const base = { search: f.search, shipper: f.shipper, origin: f.origin, method: f.method, page: Number(f.page), page_size: PAGE_SIZE };
  const parcelQuery = { ...base, stage: tab === "waiting" || tab === "lost" ? tab : "ready" };
  const shipmentList = tab === "shipments" || tab === "delivered";
  const shipmentQuery = {
    ...base,
    status: tab === "delivered" ? "completed" : f.status === "all" ? ACTIVE_STATUSES.join(",") : f.status,
  };

  const stats = useQuery({ queryKey: shippingKeys.stats, queryFn: shippingApi.shipments.stats });
  const parcels = useQuery({
    queryKey: shippingKeys.parcels(parcelQuery),
    queryFn: ({ signal }) => shippingApi.parcels.list(parcelQuery, signal),
    // Keep the previous page while paging/filtering, but never show Ready rows under Waiting (or vice versa).
    placeholderData: (prev, prevQuery) => ((prevQuery?.queryKey[2] as { stage?: string } | undefined)?.stage === parcelQuery.stage ? prev : undefined),
    enabled: !shipmentList,
  });
  const shipments = useQuery({
    queryKey: shippingKeys.shipments(shipmentQuery),
    queryFn: ({ signal }) => shippingApi.shipments.list(shipmentQuery, signal),
    placeholderData: keepPreviousData,
    enabled: shipmentList,
  });
  const carriers = useCarriers();
  const origins = useOriginCountries();

  /* Selection belongs to the list it was made on; changing filters/page clears it. */
  const selectionKey = JSON.stringify(parcelQuery);
  const [selection, setSelection] = useState<{ key: string; ids: number[] }>({ key: selectionKey, ids: [] });
  const parcelRows = useMemo(() => (tab === "ready" ? parcels.data?.results ?? [] : []), [tab, parcels.data]);
  const selected = useMemo(() => {
    const visible = new Set(parcelRows.map((p) => p.id));
    return new Set(selection.key === selectionKey ? selection.ids.filter((id) => visible.has(id)) : []);
  }, [selection, selectionKey, parcelRows]);
  const selectedParcels = parcelRows.filter((p) => selected.has(p.id));
  const toggle = (id: number) =>
    setSelection({ key: selectionKey, ids: selected.has(id) ? [...selected].filter((x) => x !== id) : [...selected, id] });
  const toggleAll = () =>
    setSelection({ key: selectionKey, ids: selected.size === parcelRows.length ? [] : parcelRows.map((p) => p.id) });
  const clearSelection = () => setSelection({ key: selectionKey, ids: [] });

  const [bulk, setBulk] = useState<"create" | "add" | null>(null);
  const [receiving, setReceiving] = useState<Parcel | null>(null);
  const [losing, setLosing] = useState<Parcel | null>(null);
  const [docsFor, setDocsFor] = useState<number | null>(null);
  const expanded = f.open ? Number(f.open) : null;

  const s = stats.data;
  const list = shipmentList ? shipments : parcels;
  const data = list.data;
  const pagination = data && data.total_pages > 1 && (
    <Pagination page={data.page} pageSize={data.page_size} count={data.count} totalPages={data.total_pages} onPageChange={(p) => setF({ page: String(p) })} disabled={list.isFetching} />
  );
  const docsShipment = shipments.data?.results.find((x) => x.id === docsFor) ?? null;
  const filtered = Boolean(f.search || f.shipper !== "all" || f.origin !== "all" || f.method !== "all" || (tab === "shipments" && f.status !== "all"));

  const empty = {
    ready: { icon: Package2, title: "No orders ready for shipment", description: "Orders appear here once their goods are received at the consolidation warehouse." },
    shipments: { icon: Ship, title: "No active shipments", description: "Select orders in Ready for Shipment to create a shipment. Finished shipments are under Delivered." },
    delivered: { icon: Ship, title: "No delivered shipments yet", description: "Shipments move here once their goods are ready for collection." },
    waiting: { icon: PackageSearch, title: "No orders waiting to be received", description: "Goods on their way to the consolidation warehouse appear here." },
    lost: { icon: PackageX, title: "No lost parcels", description: "Parcels marked lost from Waiting to Receive appear here." },
  }[tab];

  return (
    <PageContainer>
      <PageHeader title={meta.title} description={meta.description} />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Active Shipments" value={s?.active} icon={Ship} tone="blue" loading={!s} />
        <StatCard label="Ready for Shipment" value={s?.ready} icon={Package2} tone="orange" loading={!s} />
        <StatCard label="In Transit" value={s?.in_transit} icon={Ship} tone="cyan" loading={!s} />
        <StatCard label="Alerts" value={s?.alerts} icon={AlertTriangle} tone="red" loading={!s} />
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <SearchInput placeholder="Search shipments or orders..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search shipments or orders" />
          <div className="flex gap-3 flex-wrap">
            <Select className={select} aria-label="Filter by shipper" value={f.shipper} onChange={(e) => setF({ shipper: e.target.value })}>
              <option value="all">All Shippers</option>
              {carriers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select className={select} aria-label="Filter by origin" value={f.origin} onChange={(e) => setF({ origin: e.target.value })}>
              <option value="all">All Origins</option>
              {origins.data?.map((c) => <option key={c.id} value={c.iso2}>{c.display_name}</option>)}
            </Select>
            <Select className={select} aria-label="Filter by shipping method" value={f.method} onChange={(e) => setF({ method: e.target.value })}>
              <option value="all">All Methods</option>
              <option value="air-cargo">Air Cargo</option>
              <option value="sea">Sea Cargo</option>
              <option value="road">Road</option>
            </Select>
            {tab === "shipments" && (
              <Select className={select} aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value })}>
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.filter(([v]) => v !== "completed").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <PillTabs<Tab>
            value={tab}
            onChange={(t) => setF({ tab: t, open: "", status: t === "shipments" ? f.status : "all" })}
            options={[
              { value: "ready", label: `Ready for Shipment (${s?.ready ?? "…"})` },
              { value: "shipments", label: `Shipments (${s?.active ?? "…"})` },
              { value: "delivered", label: `Delivered (${s?.delivered ?? "…"})` },
              { value: "waiting", label: `Waiting to Receive (${s?.waiting ?? "…"})` },
              { value: "lost", label: `Lost (${s?.lost ?? "…"})` },
            ]}
          />
        </div>
      </Card>

      {tab === "ready" && canEdit && selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between" role="region" aria-label="Bulk actions">
          <p className="text-blue-900 font-medium">
            {selected.size} order(s) selected{" "}
            <button type="button" onClick={clearSelection} className="ml-2 text-sm text-blue-700 underline hover:text-blue-900">
              Clear
            </button>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setBulk("create")}>
              <Plus className="size-4" />
              Create New Shipment
            </Button>
            <Button variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50" onClick={() => setBulk("add")}>
              Add to Existing Shipment
            </Button>
          </div>
        </div>
      )}

      {list.isError && !data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.isPending && (data?.results.length ?? 0) === 0 ? (
        <EmptyState icon={empty.icon} title={empty.title} description={filtered ? "Try adjusting your filters or search terms" : empty.description} />
      ) : tab === "ready" ? (
        <ReadyTable rows={parcelRows} loading={parcels.isPending} selected={selected} onToggle={toggle} onToggleAll={toggleAll} selectable={canEdit} footer={pagination} />
      ) : tab === "waiting" ? (
        <WaitingTable rows={parcels.data?.results ?? []} loading={parcels.isPending} canEdit={canEdit} onReceive={setReceiving} onLost={setLosing} footer={pagination} />
      ) : tab === "lost" ? (
        <WaitingTable rows={parcels.data?.results ?? []} loading={parcels.isPending} canEdit={canEdit} onReceive={setReceiving} lost footer={pagination} />
      ) : (
        <ShipmentsTable
          rows={shipments.data?.results ?? []}
          loading={shipments.isPending}
          expanded={expanded}
          onExpand={(id) => setF({ open: id ? String(id) : "", page: f.page })}
          onDocuments={(sh) => setDocsFor(sh.id)}
          canEdit={canEdit}
          footer={pagination}
        />
      )}

      {bulk === "create" && selectedParcels.length > 0 && (
        <CreateShipmentModal
          parcels={selectedParcels}
          onClose={() => setBulk(null)}
          onCreated={(sh) => {
            setBulk(null);
            clearSelection();
            setF({ tab: "shipments", open: String(sh.id), status: "all" });
          }}
        />
      )}
      {bulk === "add" && selectedParcels.length > 0 && (
        <AddToShipmentModal
          parcels={selectedParcels}
          onClose={() => setBulk(null)}
          onAdded={() => {
            setBulk(null);
            clearSelection();
          }}
        />
      )}
      {receiving && <ReceiveModal parcel={receiving} onClose={() => setReceiving(null)} />}
      {losing && <MarkLostModal parcel={losing} onClose={() => setLosing(null)} />}
      {docsShipment && <DocumentsModal shipment={docsShipment} canEdit={canEdit && docsShipment.status !== "cancelled"} onClose={() => setDocsFor(null)} />}
    </PageContainer>
  );
}
