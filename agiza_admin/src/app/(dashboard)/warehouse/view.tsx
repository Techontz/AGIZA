"use client";

import { useQuery } from "@tanstack/react-query";
import { Package, Plus, Store, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";

import { MiniStat, useWarehouseAccess } from "@/components/warehouse/shared";
import { InventoryTab, ShopFloorTab } from "@/components/warehouse/stock-tabs";
import { WarehouseFormDialog } from "@/components/warehouse/warehouse-form-dialog";
import { WarehousesTab } from "@/components/warehouse/warehouses-tab";
import { PageContainer } from "@/components/ui/page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import { inventoryApi, inventoryKeys, warehouseApi, warehouseKeys } from "@/lib/api/services/warehouse";
import { pageMeta } from "@/lib/nav";

type Tab = "warehouses" | "inventory" | "shop";

const DEFAULTS = { tab: "warehouses", search: "", country: "all", type: "all", status: "all", stock: "all", loc: "all", page: "1" };

export function WarehouseView() {
  const meta = pageMeta["/warehouse"];
  const { canEdit } = useWarehouseAccess();
  const [f, setF] = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useState(f.search);
  const [adding, setAdding] = useState(false);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const tab: Tab = f.tab === "inventory" || f.tab === "shop" ? f.tab : "warehouses";
  const whStats = useQuery({ queryKey: warehouseKeys.stats, queryFn: warehouseApi.stats });
  const stockStats = useQuery({ queryKey: inventoryKeys.stats, queryFn: inventoryApi.stats });
  const ws = whStats.data;
  const ss = stockStats.data;

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setSearch("");
    setF({ ...DEFAULTS, tab: next });
  };

  const tabs: { id: Tab; label: string; icon: typeof Warehouse; count?: number }[] = [
    { id: "warehouses", label: "Warehouses & Locations", icon: Warehouse, count: ws?.total },
    { id: "inventory", label: "Inventory", icon: Package, count: ss?.total_skus },
    { id: "shop", label: "Shop Floor", icon: Store, count: ss?.shop_items },
  ];
  const statsError = tab === "warehouses" ? whStats.isError && whStats : stockStats.isError && stockStats;

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Warehouse className="size-7 text-blue-600" />
            {meta.title}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{meta.description}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            <Plus className="size-4" />
            Add Warehouse / Location
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
            className={cn(
              "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
              tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            <span className={cn("px-1.5 py-0.5 rounded-full text-xs", tab === t.id ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500")}>{t.count ?? "…"}</span>
          </button>
        ))}
      </div>

      {statsError && (
        <p className="-mt-3 mb-4 text-sm text-red-600" role="alert">
          Couldn&apos;t load totals: {errorText(statsError.error)}{" "}
          <button type="button" className="font-medium text-blue-600 hover:text-blue-800" onClick={() => statsError.refetch()}>
            Retry
          </button>
        </p>
      )}

      {tab === "warehouses" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            <MiniStat label="Consolidation Hubs" value={ws?.consolidation} tone="text-indigo-600 bg-indigo-50" loading={whStats.isPending} />
            <MiniStat label="Fulfillment Centers" value={ws?.fulfillment} tone="text-amber-600 bg-amber-50" loading={whStats.isPending} />
            <MiniStat label="Pickup Points" value={ws?.pickup_point} tone="text-cyan-600 bg-cyan-50" loading={whStats.isPending} />
            <MiniStat label="Shop Locations" value={ws?.shop} tone="text-purple-600 bg-purple-50" loading={whStats.isPending} />
            <MiniStat label="Pending Audits" value={ws?.pending_audits} tone="text-orange-600 bg-orange-50" loading={whStats.isPending} />
          </div>
          <WarehousesTab filters={f} search={search} onSearch={setSearch} setFilters={setF} />
        </>
      )}
      {tab === "inventory" && <InventoryTab filters={f} search={search} onSearch={setSearch} setFilters={setF} stats={ss} statsLoading={stockStats.isPending} />}
      {tab === "shop" && <ShopFloorTab filters={f} search={search} onSearch={setSearch} setFilters={setF} stats={ss} statsLoading={stockStats.isPending} />}

      <WarehouseFormDialog open={adding} onClose={() => setAdding(false)} />
    </PageContainer>
  );
}
