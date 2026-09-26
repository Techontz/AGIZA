"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Edit, MapPin, Trash2, Warehouse } from "lucide-react";
import { useState } from "react";

import { useCountries } from "@/components/shipping-engine/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { warehouseApi, warehouseKeys, type WarehouseLocation } from "@/lib/api/services/warehouse";
import { formatDate } from "@/lib/format";

import {
  CapacityBar,
  LOCATION_INVALIDATE,
  SearchBox,
  SkeletonRows,
  WarehouseStatusBadge,
  WarehouseTypeBadge,
  auditPending,
  filterSelect,
  iconBtn,
  td,
  th,
  useWarehouseAccess,
} from "./shared";
import { WarehouseFormDialog } from "./warehouse-form-dialog";

const COLUMNS = ["Warehouse", "Type", "Location", "Contact", "Capacity", "Status", "Last Audit", "Actions"];

export interface WarehouseFilters {
  search: string;
  country: string;
  type: string;
  status: string;
  page: string;
}

export function WarehousesTab({
  filters: f,
  search,
  onSearch,
  setFilters,
}: {
  filters: WarehouseFilters;
  search: string;
  onSearch: (v: string) => void;
  setFilters: (patch: Partial<WarehouseFilters>) => void;
}) {
  const { canEdit, canManage } = useWarehouseAccess();
  const countries = useCountries();
  const [editing, setEditing] = useState<WarehouseLocation | null>(null);
  const [deleting, setDeleting] = useState<WarehouseLocation | null>(null);

  const query = { search: f.search, country: f.country, type: f.type, status: f.status, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: warehouseKeys.list(query),
    queryFn: ({ signal }) => warehouseApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const filtered = Boolean(f.search || f.country !== "all" || f.type !== "all" || f.status !== "all");

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SearchBox value={search} onChange={onSearch} placeholder="Search by name, city, ID..." label="Search warehouses" />
        <select className={filterSelect} aria-label="Filter by country" value={f.country} onChange={(e) => setFilters({ country: e.target.value })}>
          <option value="all">All Countries</option>
          {countries.data?.map((c) => (
            <option key={c.id} value={c.iso2}>
              {c.display_name || c.name}
            </option>
          ))}
        </select>
        <select className={filterSelect} aria-label="Filter by type" value={f.type} onChange={(e) => setFilters({ type: e.target.value })}>
          <option value="all">All Types</option>
          <option value="consolidation">Consolidation</option>
          <option value="fulfillment">Fulfillment</option>
          <option value="pickup_point">Pickup Point</option>
          <option value="shop">Shop</option>
        </select>
        <select className={filterSelect} aria-label="Filter by status" value={f.status} onChange={(e) => setFilters({ status: e.target.value })}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="full">Full</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Warehouse className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">{filtered ? "No locations found" : "No locations yet"}</p>
          <p className="text-gray-500 text-sm mt-2">{filtered ? "Try adjusting your filters or search terms" : "Add a consolidation hub, fulfillment center, pickup point or shop."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {COLUMNS.map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.isPending ? (
                  <SkeletonRows columns={COLUMNS.length} />
                ) : (
                  rows.map((wh) => {
                    const stale = auditPending(wh.last_audit_at, wh.status);
                    return (
                      <tr key={wh.id} className="hover:bg-gray-50 transition-colors">
                        <td className={td}>
                          <p className="font-semibold text-gray-900 whitespace-nowrap">{wh.name}</p>
                          <span className="font-mono text-xs text-gray-400">{wh.code}</span>
                        </td>
                        <td className={td}>
                          <WarehouseTypeBadge type={wh.type} label={wh.type_display} />
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="size-3.5 text-gray-400 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-gray-800 whitespace-nowrap">
                                {wh.city_name}, {wh.country_name}
                              </p>
                              {wh.address && (
                                <p className="text-xs text-gray-400 truncate max-w-40" title={wh.address}>
                                  {wh.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={td}>
                          <p className="text-sm text-gray-800 whitespace-nowrap">{wh.contact_person || "—"}</p>
                          {wh.phone && <p className="text-xs text-gray-400 whitespace-nowrap">{wh.phone}</p>}
                        </td>
                        <td className={td}>
                          <CapacityBar percent={wh.capacity_percent} />
                        </td>
                        <td className={td}>
                          <WarehouseStatusBadge status={wh.status} label={wh.status_display} />
                        </td>
                        <td className={td}>
                          <span className={stale ? "text-xs text-orange-600 font-medium whitespace-nowrap" : "text-xs text-gray-500 whitespace-nowrap"} title={stale ? "Audit due" : undefined}>
                            {wh.last_audit_at ? formatDate(wh.last_audit_at) : "Never"}
                          </span>
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => setEditing(wh)}
                              className={`${iconBtn} hover:bg-blue-50 group`}
                              aria-label={`Edit ${wh.name}`}
                              title={canEdit ? "Edit" : "You don't have permission to edit locations"}
                            >
                              <Edit className="size-4 text-gray-400 group-hover:text-blue-600" />
                            </button>
                            {canManage && (
                              <button type="button" onClick={() => setDeleting(wh)} className={`${iconBtn} hover:bg-red-50 group`} aria-label={`Delete ${wh.name}`} title="Delete">
                                <Trash2 className="size-4 text-gray-400 group-hover:text-red-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total_pages > 1 && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={(p) => setFilters({ page: String(p) })}
              disabled={list.isFetching}
            />
          )}
        </div>
      )}

      <WarehouseFormDialog open={Boolean(editing)} warehouse={editing} onClose={() => setEditing(null)} />
      <DeleteWarehouseDialog warehouse={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

/** Delete a location; one that's in use (409) can be set Inactive instead. */
function DeleteWarehouseDialog({ warehouse, onClose }: { warehouse: WarehouseLocation | null; onClose: () => void }) {
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setConflict(null);
    setError(null);
    onClose();
  };
  const remove = useApiMutation((w: WarehouseLocation) => warehouseApi.remove(w.id), {
    invalidate: LOCATION_INVALIDATE,
    success: `${warehouse?.name ?? "Location"} deleted`,
    onSuccess: close,
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) setConflict(e.message);
      else setError(errorText(e));
    },
  });
  const deactivate = useApiMutation((w: WarehouseLocation) => warehouseApi.update(w.id, { status: "inactive" }), {
    invalidate: LOCATION_INVALIDATE,
    success: (w) => `${w.name} set to Inactive`,
    onSuccess: close,
    onError: (e) => setError(errorText(e)),
  });

  if (!warehouse) return null;
  if (conflict) {
    const inactive = warehouse.status === "inactive";
    return (
      <ConfirmDialog
        open
        title="Location in use"
        message={
          <>
            <p>{conflict}</p>
            <p className="mt-2 text-sm text-gray-600">
              {inactive
                ? `${warehouse.name} is already inactive, so it won't be offered for new stock, shipments or deliveries.`
                : `Setting ${warehouse.name} to Inactive keeps its history and stops it being used for new stock, shipments and deliveries.`}
            </p>
          </>
        }
        confirmLabel={inactive ? "Close" : "Set Inactive"}
        pending={deactivate.isPending}
        onConfirm={() => (inactive ? close() : deactivate.mutate(warehouse))}
        onClose={close}
      >
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </ConfirmDialog>
    );
  }
  return (
    <ConfirmDialog
      open
      title={`Delete ${warehouse.code}?`}
      message={
        <>
          <strong>{warehouse.name}</strong> will be permanently removed. Locations that hold stock or appear on shipments, orders or deliveries can&apos;t be deleted.
        </>
      }
      confirmLabel="Delete Location"
      tone="danger"
      pending={remove.isPending}
      onConfirm={() => remove.mutate(warehouse)}
      onClose={close}
    >
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
