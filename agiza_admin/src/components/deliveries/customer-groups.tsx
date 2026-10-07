"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MapPin, Phone, Truck, User } from "lucide-react";
import React, { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import type { QueryParams } from "@/lib/api/client";
import { deliveriesApi, deliveryKeys, type Delivery, type DeliveryGroup, type DeliveryStatus } from "@/lib/api/services/deliveries";

import { useDeliveryAccess } from "./access";
import { BulkAssignDriverDialog, BulkCompleteDialog } from "./action-dialogs";
import { DELIVERY_STATUS, DeliveryExceptionBadge, DeliveryStatusBadge, OrderSourceBadge } from "./badges";
import { DeliveryItemsTable, DeliveryRowDetails } from "./row-details";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";
const COLUMNS = ["Customer", "Destination", "Orders", "Driver", "Status", "Actions"];
const ASSIGNABLE: DeliveryStatus[] = ["pending", "rescheduled", "assigned_driver", "out_for_delivery"];

/**
 * Deliveries grouped by customer: one row per client with the number of orders to deliver.
 * Expanding a client lists each order with its items (SKU, bin code, warehouse) and lets staff
 * assign one driver or record one proof of delivery for the selected orders together.
 */
export function CustomerGroups({
  query,
  openId,
  setOpen,
  onPageChange,
}: {
  query: QueryParams;
  openId: number | null;
  setOpen: (id: number | null) => void;
  onPageChange: (page: number) => void;
}) {
  const groups = useQuery({
    queryKey: deliveryKeys.groups(query),
    queryFn: ({ signal }) => deliveriesApi.byCustomer(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = groups.data?.results ?? [];

  if (groups.isError && !groups.data) return <ErrorState message={errorText(groups.error)} onRetry={() => groups.refetch()} />;
  if (!groups.isPending && rows.length === 0)
    return (
      <Card className="p-12 text-center">
        <Truck className="size-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 text-lg">No deliveries found</p>
        <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
      </Card>
    );
  return (
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
            {groups.isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {COLUMNS.map((c) => (
                      <td key={c} className="px-6 py-4">
                        <div className="h-4 rounded bg-gray-200 animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((g) => (
                  <GroupRow key={g.customer.id} group={g} open={openId === g.customer.id} toggle={() => setOpen(openId === g.customer.id ? null : g.customer.id)} />
                ))}
          </tbody>
        </table>
      </div>
      {groups.data && (
        <Pagination
          page={groups.data.page}
          pageSize={groups.data.page_size}
          count={groups.data.count}
          totalPages={groups.data.total_pages}
          onPageChange={onPageChange}
          disabled={groups.isFetching}
        />
      )}
    </Card>
  );
}

function GroupRow({ group: g, open, toggle }: { group: DeliveryGroup; open: boolean; toggle: () => void }) {
  return (
    <React.Fragment>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <div className="flex items-start gap-2">
            <User className="size-4 text-gray-400 flex-shrink-0 mt-1" />
            <div>
              <div className="font-semibold text-gray-900 whitespace-nowrap">{g.customer.full_name}</div>
              {g.customer.phone && (
                <a href={`tel:${g.customer.phone}`} className="text-sm text-gray-600 hover:text-blue-700 whitespace-nowrap">
                  {g.customer.phone}
                </a>
              )}
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-start gap-2 min-w-48 max-w-xs">
            <MapPin className="size-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span className="text-gray-900">{g.destination || "—"}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-50 text-blue-800 whitespace-nowrap">
            {g.count} {g.count === 1 ? "order" : "orders"}
          </span>
        </td>
        <td className="px-6 py-4">
          {g.drivers.length === 0 ? (
            <span className="text-sm text-gray-500 italic">Unassigned</span>
          ) : (
            <div className="space-y-1">
              {g.drivers.map((d) => (
                <div key={d.id} className="whitespace-nowrap">
                  <div className="text-gray-900">{d.full_name}</div>
                  {d.phone && (
                    <a href={`tel:${d.phone}`} className="text-xs text-gray-600 hover:text-blue-700 inline-flex items-center gap-1">
                      <Phone className="size-3" /> {d.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </td>
        <td className="px-6 py-4">
          <div className="flex flex-wrap gap-1">
            {g.statuses.map((s) => (
              <span key={s.status} className={cn("px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap", DELIVERY_STATUS[s.status]?.[0] ?? "bg-gray-100 text-gray-800")}>
                {s.count > 1 ? `${s.count} × ` : ""}
                {s.status_display}
              </span>
            ))}
          </div>
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} orders for ${g.customer.full_name}`}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 whitespace-nowrap"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {open ? "Less" : "Orders"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={COLUMNS.length} className="px-6 py-4 bg-gray-50">
            <GroupDetails group={g} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

function GroupDetails({ group: g }: { group: DeliveryGroup }) {
  const { canEdit, canManage } = useDeliveryAccess();
  const [picked, setPicked] = useState<Set<number>>(() => new Set(g.deliveries.map((d) => d.id)));
  const [details, setDetails] = useState<number | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);

  // Keep the selection to deliveries still in the group (after a refresh).
  const selected = useMemo(() => g.deliveries.filter((d) => picked.has(d.id)), [g.deliveries, picked]);
  const assignable = selected.filter((d) => ASSIGNABLE.includes(d.status));
  const completable = selected.filter((d) => d.status === "out_for_delivery");
  const allPicked = selected.length === g.deliveries.length;

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const btn = "px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:bg-gray-300 disabled:text-white disabled:cursor-not-allowed";
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
          <input
            type="checkbox"
            className="size-4 rounded border-gray-300"
            checked={allPicked}
            onChange={() => setPicked(allPicked ? new Set() : new Set(g.deliveries.map((d) => d.id)))}
          />
          Select all {g.count} orders of {g.customer.full_name}
        </label>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <button
                type="button"
                className={cn(btn, "bg-blue-600 text-white hover:bg-blue-700")}
                disabled={assignable.length === 0}
                title={assignable.length ? undefined : "Select deliveries that are pending, rescheduled or already assigned"}
                onClick={() => setAssignOpen(true)}
              >
                Assign Driver ({assignable.length})
              </button>
            )}
            <button
              type="button"
              className={cn(btn, "bg-green-600 text-white hover:bg-green-700")}
              disabled={completable.length === 0}
              title={completable.length ? undefined : "Select deliveries that are out for delivery"}
              onClick={() => setCompleteOpen(true)}
            >
              Complete with Proof ({completable.length})
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {g.deliveries.map((d) => (
          <DeliveryCard key={d.id} delivery={d} checked={picked.has(d.id)} onCheck={() => toggle(d.id)} open={details === d.id} onToggle={() => setDetails(details === d.id ? null : d.id)} />
        ))}
      </div>

      <BulkAssignDriverDialog deliveries={assignable} open={assignOpen} onClose={() => setAssignOpen(false)} />
      <BulkCompleteDialog deliveries={completable} open={completeOpen} onClose={() => setCompleteOpen(false)} />
    </div>
  );
}

function DeliveryCard({ delivery: d, checked, onCheck, open, onToggle }: { delivery: Delivery; checked: boolean; onCheck: () => void; open: boolean; onToggle: () => void }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <input type="checkbox" className="size-4 rounded border-gray-300" checked={checked} onChange={onCheck} aria-label={`Select ${d.reference}`} />
        <div>
          <div className="font-semibold text-gray-900 whitespace-nowrap">{d.reference}</div>
          <div className="text-xs text-gray-500 whitespace-nowrap">Order {d.order.reference}</div>
        </div>
        <OrderSourceBadge source={d.source} label={d.source_display} />
        <DeliveryStatusBadge delivery={d} />
        <DeliveryExceptionBadge flag={d.exception_flag} />
        <div className="text-sm text-gray-700 whitespace-nowrap">
          {d.driver ? (
            <>
              {d.driver.full_name}
              {d.driver.phone && (
                <a href={`tel:${d.driver.phone}`} className="ml-2 text-gray-500 hover:text-blue-700">
                  {d.driver.phone}
                </a>
              )}
            </>
          ) : (
            <span className="italic text-gray-500">No driver</span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} details for ${d.reference}`}
          className="ml-auto text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {open ? "Less" : "Details"}
        </button>
      </div>
      <div className="px-4 pb-4">{open ? <DeliveryRowDetails delivery={d} /> : <DeliveryItemsTable delivery={d} />}</div>
    </div>
  );
}
