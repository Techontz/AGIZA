"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Building2, Edit, History, Package, PackagePlus, SlidersHorizontal, Store } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import { inventoryApi, inventoryKeys, type StockItem, type StockStats } from "@/lib/api/services/warehouse";
import { formatDate } from "@/lib/format";

import { MiniStat, SearchBox, SkeletonRows, StockStatusBadge, filterSelect, iconBtn, td, th, useLocationOptions, useWarehouseAccess } from "./shared";
import { AdjustStockDialog, EditShopItemDialog, MovementsDialog, ReceiveStockDialog, TransferInDialog, TransferStockDialog } from "./stock-dialogs";

export interface StockFilters {
  search: string;
  stock: string;
  loc: string;
  page: string;
}

type Dialog = { kind: "adjust" | "transfer" | "movements" | "edit"; item: StockItem } | { kind: "receive" | "transfer_in" } | null;

interface TabProps {
  filters: StockFilters;
  search: string;
  onSearch: (v: string) => void;
  setFilters: (patch: Partial<StockFilters>) => void;
  stats?: StockStats;
  statsLoading: boolean;
}

/* ---------------------------------------------------------- row actions */

function RowActions({ item, shop, open }: { item: StockItem; shop: boolean; open: (d: Dialog) => void }) {
  const { canEdit } = useWarehouseAccess();
  const name = `${item.sku} at ${item.warehouse.name}`;
  return (
    <div className="flex items-center gap-1">
      {canEdit && shop && (
        <button type="button" onClick={() => open({ kind: "edit", item })} className={cn(iconBtn, "hover:bg-blue-50 group")} aria-label={`Edit shelf, price and visibility of ${name}`} title="Edit shelf / price / visibility">
          <Edit className="size-4 text-gray-400 group-hover:text-blue-600" />
        </button>
      )}
      {canEdit && (
        <>
          <button type="button" onClick={() => open({ kind: "adjust", item })} className={cn(iconBtn, "hover:bg-blue-50 group")} aria-label={`Adjust count of ${name}`} title="Adjust count">
            <SlidersHorizontal className="size-4 text-gray-400 group-hover:text-blue-600" />
          </button>
          <button
            type="button"
            onClick={() => open({ kind: "transfer", item })}
            disabled={item.available <= 0}
            className={cn(iconBtn, "hover:bg-blue-50 group")}
            aria-label={`Transfer ${name}`}
            title={item.available > 0 ? "Transfer" : "Nothing available to transfer"}
          >
            <ArrowLeftRight className="size-4 text-gray-400 group-hover:text-blue-600" />
          </button>
        </>
      )}
      <button type="button" onClick={() => open({ kind: "movements", item })} className={cn(iconBtn, "hover:bg-gray-100 group")} aria-label={`Movement history of ${name}`} title="Movements">
        <History className="size-4 text-gray-400 group-hover:text-gray-700" />
      </button>
    </div>
  );
}

function Dialogs({ dialog, close, floor }: { dialog: Dialog; close: () => void; floor: "warehouse" | "shop" }) {
  const item = dialog && "item" in dialog ? dialog.item : null;
  return (
    <>
      <ReceiveStockDialog open={dialog?.kind === "receive"} onClose={close} floor={floor} />
      <TransferInDialog open={dialog?.kind === "transfer_in"} onClose={close} />
      <AdjustStockDialog item={dialog?.kind === "adjust" ? item : null} onClose={close} />
      <TransferStockDialog item={dialog?.kind === "transfer" ? item : null} onClose={close} />
      <MovementsDialog item={dialog?.kind === "movements" ? item : null} onClose={close} />
      <EditShopItemDialog item={dialog?.kind === "edit" ? item : null} onClose={close} />
    </>
  );
}

/** Shared list query for both floors. */
function useStockList(floor: "warehouse" | "shop", f: StockFilters) {
  const query = { floor, search: f.search, status: f.stock, warehouse: f.loc, page: Number(f.page), page_size: 20 };
  return useQuery({
    queryKey: inventoryKeys.list(query),
    queryFn: ({ signal }) => inventoryApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
}

function Filters({
  floor,
  filters: f,
  search,
  onSearch,
  setFilters,
  actions,
}: Pick<TabProps, "filters" | "search" | "onSearch" | "setFilters"> & { floor: "warehouse" | "shop"; actions: React.ReactNode }) {
  const locations = useLocationOptions();
  const shop = floor === "shop";
  const locs = (locations.data ?? []).filter((w) => (shop ? w.type === "shop" : w.type !== "shop"));
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <SearchBox value={search} onChange={onSearch} placeholder={shop ? "Search shop items..." : "Search by name, SKU, location..."} label={shop ? "Search shop items" : "Search inventory"} />
      <select className={filterSelect} aria-label={shop ? "Filter by shop" : "Filter by location"} value={f.loc} onChange={(e) => setFilters({ loc: e.target.value })}>
        <option value="all">{shop ? "All Shops" : "All Locations"}</option>
        {locs.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <select className={filterSelect} aria-label="Filter by stock status" value={f.stock} onChange={(e) => setFilters({ stock: e.target.value })}>
        <option value="all">All Statuses</option>
        {shop ? (
          <>
            <option value="listed">Listed</option>
            <option value="hidden">Hidden</option>
            <option value="out_of_stock">Out of Stock</option>
          </>
        ) : (
          <>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="reserved">Reserved</option>
          </>
        )}
      </select>
      <div className="flex flex-wrap gap-2 sm:ml-auto">{actions}</div>
    </div>
  );
}

function Empty({ icon: Icon, filtered, shop }: { icon: typeof Package; filtered: boolean; shop: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <Icon className="size-12 text-gray-400 mx-auto mb-4" />
      <p className="text-gray-600 text-lg">{filtered ? "No items found" : shop ? "No shop floor stock yet" : "No inventory yet"}</p>
      <p className="text-gray-500 text-sm mt-2">
        {filtered ? "Try adjusting your filters or search terms" : shop ? "Transfer stock from a warehouse or receive it straight into a shop." : "Receive stock to start tracking inventory."}
      </p>
    </div>
  );
}

function Qty({ item }: { item: StockItem }) {
  return (
    <div className="whitespace-nowrap">
      <span className={cn("font-bold text-sm", item.status === "out_of_stock" || item.quantity === 0 ? "text-red-600" : item.status === "low_stock" ? "text-orange-600" : "text-gray-900")}>
        {item.quantity}
      </span>
      {item.reserved > 0 && <span className="block text-xs text-blue-700">{item.reserved} reserved</span>}
    </div>
  );
}

/* ------------------------------------------------------------ inventory */

const INV_COLUMNS = ["SKU", "Product", "Category", "Warehouse Location", "Shelf / Bin", "Qty", "Origin", "Status", "Updated", "Actions"];

export function InventoryTab({ filters: f, search, onSearch, setFilters, stats, statsLoading }: TabProps) {
  const { canEdit } = useWarehouseAccess();
  const [dialog, setDialog] = useState<Dialog>(null);
  const list = useStockList("warehouse", f);
  const rows = list.data?.results ?? [];
  const filtered = Boolean(f.search || f.stock !== "all" || f.loc !== "all");

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <MiniStat label="Total SKUs" value={stats?.total_skus} tone="text-blue-700 bg-blue-50" loading={statsLoading} />
        <MiniStat label="In Stock" value={stats?.in_stock} tone="text-green-700 bg-green-50" loading={statsLoading} />
        <MiniStat label="Low Stock" value={stats?.low_stock} tone="text-orange-700 bg-orange-50" loading={statsLoading} />
        <MiniStat label="Out of Stock" value={stats?.out_of_stock} tone="text-red-700 bg-red-50" loading={statsLoading} />
      </div>

      <Filters
        floor="warehouse"
        filters={f}
        search={search}
        onSearch={onSearch}
        setFilters={setFilters}
        actions={
          canEdit && (
            <Button size="sm" onClick={() => setDialog({ kind: "receive" })}>
              <PackagePlus className="size-4" /> Receive Stock
            </Button>
          )
        }
      />

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <Empty icon={Package} filtered={filtered} shop={false} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {INV_COLUMNS.map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.isPending ? (
                  <SkeletonRows columns={INV_COLUMNS.length} />
                ) : (
                  rows.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className={cn(td, "font-mono text-xs text-gray-400 whitespace-nowrap")}>{item.sku}</td>
                      <td className={cn(td, "font-medium text-gray-900 max-w-44 truncate")} title={item.product.name}>
                        {item.product.name}
                      </td>
                      <td className={cn(td, "text-gray-500 text-xs")}>{item.category}</td>
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-gray-400 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-800 whitespace-nowrap">{item.warehouse.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{item.warehouse.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className={cn(td, "font-mono text-xs text-indigo-700 font-semibold whitespace-nowrap")}>{item.bin_code || <span className="text-gray-400 font-normal">—</span>}</td>
                      <td className={td}>
                        <Qty item={item} />
                      </td>
                      <td className={cn(td, "text-gray-500 text-xs whitespace-nowrap")}>{item.origin ?? "—"}</td>
                      <td className={td}>
                        <StockStatusBadge status={item.status} label={item.status_display} />
                      </td>
                      <td className={cn(td, "text-xs text-gray-400 whitespace-nowrap")}>{formatDate(item.updated_at)}</td>
                      <td className={td}>
                        <RowActions item={item} shop={false} open={setDialog} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setFilters({ page: String(p) })} disabled={list.isFetching} />
          )}
        </div>
      )}

      <Dialogs dialog={dialog} close={() => setDialog(null)} floor="warehouse" />
    </div>
  );
}

/* ----------------------------------------------------------- shop floor */

const SHOP_COLUMNS = ["SKU", "Product", "Category", "Shop Location", "Shelf Position", "Qty", "Price (TSh)", "Status", "Updated", "Actions"];

export function ShopFloorTab({ filters: f, search, onSearch, setFilters }: TabProps) {
  const { canEdit } = useWarehouseAccess();
  const [dialog, setDialog] = useState<Dialog>(null);
  const list = useStockList("shop", f);
  const rows = list.data?.results ?? [];
  const filtered = Boolean(f.search || f.stock !== "all" || f.loc !== "all");

  return (
    <div>
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5 flex items-start gap-3">
        <Store className="size-4 text-purple-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-purple-800">Shop floor items are products displayed in physical Agiza shop locations. Stock here is separate from warehouse inventory.</p>
      </div>

      <Filters
        floor="shop"
        filters={f}
        search={search}
        onSearch={onSearch}
        setFilters={setFilters}
        actions={
          canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "receive" })}>
                <PackagePlus className="size-4" /> Receive into Shop
              </Button>
              <Button size="sm" onClick={() => setDialog({ kind: "transfer_in" })}>
                <ArrowLeftRight className="size-4" /> Transfer from Warehouse
              </Button>
            </>
          )
        }
      />

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <Empty icon={Store} filtered={filtered} shop />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {SHOP_COLUMNS.map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.isPending ? (
                  <SkeletonRows columns={SHOP_COLUMNS.length} />
                ) : (
                  rows.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className={cn(td, "font-mono text-xs text-gray-400 whitespace-nowrap")}>{item.sku}</td>
                      <td className={cn(td, "font-medium text-gray-900 max-w-44 truncate")} title={item.product.name}>
                        {item.product.name}
                      </td>
                      <td className={cn(td, "text-gray-500 text-xs")}>{item.category}</td>
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          <Store className="size-3.5 text-purple-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-gray-800 whitespace-nowrap">{item.warehouse.name}</span>
                        </div>
                      </td>
                      <td className={cn(td, "text-xs text-gray-600 whitespace-nowrap")}>{item.bin_code || <span className="text-gray-400">—</span>}</td>
                      <td className={td}>
                        <Qty item={item} />
                      </td>
                      <td className={cn(td, "font-bold text-blue-700 whitespace-nowrap")} title={item.shop_price === null ? "Product price" : "Shop price"}>
                        {Number(item.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </td>
                      <td className={td}>
                        <StockStatusBadge status={item.status} label={item.status_display} />
                      </td>
                      <td className={cn(td, "text-xs text-gray-400 whitespace-nowrap")}>{formatDate(item.updated_at)}</td>
                      <td className={td}>
                        <RowActions item={item} shop open={setDialog} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setFilters({ page: String(p) })} disabled={list.isFetching} />
          )}
        </div>
      )}

      <Dialogs dialog={dialog} close={() => setDialog(null)} floor="shop" />
    </div>
  );
}
