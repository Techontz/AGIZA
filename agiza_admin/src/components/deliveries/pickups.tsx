"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, MapPin, PackageCheck, Phone, Store, Truck, UserCheck, Warehouse, XCircle } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, SearchInput, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorText } from "@/lib/api/errors";
import { catalogApi, catalogKeys } from "@/lib/api/services/catalog";
import { deliveriesApi, deliveryKeys, type PickupStatus, type PickupTask } from "@/lib/api/services/deliveries";
import { orderKeys } from "@/lib/api/services/orders";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

import { useDeliveryAccess } from "./access";
import { FormAlert, fromLocalInput, mergedErrors, toLocalInput } from "./form-helpers";

/** A pickup reaching the hub can unblock shipping the order. */
const INVALIDATE = [deliveryKeys.all, orderKeys.all, ["marketplace"]];

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";
const pill = "px-3 py-1 rounded-full text-xs font-medium inline-flex w-fit items-center whitespace-nowrap";
const COLUMNS = ["Pickup ID", "Order ID", "Seller", "Collect From", "Deliver To", "Assigned Rider", "Status", "Actions"];

export const PICKUP_STATUS: Record<PickupStatus, [string, string]> = {
  pending: ["bg-yellow-100 text-yellow-800", "Waiting for the seller"],
  ready: ["bg-indigo-100 text-indigo-800", "Ready to collect"],
  assigned: ["bg-blue-100 text-blue-800", "Rider assigned"],
  collected: ["bg-purple-100 text-purple-800", "Collected"],
  at_hub: ["bg-green-100 text-green-800", "At AGIZA hub"],
  failed: ["bg-red-100 text-red-800", "Collection failed"],
  cancelled: ["bg-gray-100 text-gray-500", "Cancelled"],
};

export function PickupStatusBadge({ status, label }: { status: PickupStatus | string; label: string }) {
  const [cls, l] = PICKUP_STATUS[status as PickupStatus] ?? ["bg-gray-100 text-gray-800", label];
  return <span className={cn(pill, cls)}>{l}</span>;
}

const statusLabel = (s: string) => PICKUP_STATUS[s as PickupStatus]?.[1] ?? s;

/* -------------------------------------------------------------- list view */

/** Pickups tab of the Deliveries page: the collection legs from sellers to the hub. */
export function PickupsPanel({
  f,
  setF,
}: {
  f: { psearch: string; pstatus: string; pvendor: string; pdriver: string; ppage: string; popen: string };
  setF: (patch: Partial<{ psearch: string; pstatus: string; pvendor: string; pdriver: string; ppage: string; popen: string }>) => void;
}) {
  const { isDriver } = useDeliveryAccess();
  const [search, setSearch] = useState(f.psearch);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.psearch) setF({ psearch: debounced, popen: "", ppage: "" });
  }, [debounced, f.psearch, setF]);

  const query = { search: f.psearch, status: f.pstatus, vendor: f.pvendor, driver: f.pdriver, page: Number(f.ppage || 1), page_size: 20 };
  const list = useQuery({
    queryKey: deliveryKeys.pickups(query),
    queryFn: ({ signal }) => deliveriesApi.pickups.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const drivers = useQuery({ queryKey: deliveryKeys.drivers, queryFn: deliveriesApi.drivers, enabled: !isDriver, staleTime: 60_000 });
  // Vendors need E-commerce access; without it the seller filter is simply hidden.
  const vendorQuery = { page_size: 100 };
  const vendors = useQuery({
    queryKey: catalogKeys.vendorList(vendorQuery),
    queryFn: ({ signal }) => catalogApi.vendors.list(vendorQuery, signal),
    enabled: !isDriver,
    staleTime: 60_000,
    retry: false,
  });
  const rows = list.data?.results ?? [];
  const expanded = f.popen ? Number(f.popen) : null;

  return (
    <>
      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <SearchInput
            placeholder="Search by Pickup ID, Order ID, or Seller..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search pickups"
          />
          <div className="flex gap-3 flex-wrap">
            <Select className="w-auto bg-white" aria-label="Filter by status" value={f.pstatus} onChange={(e) => setF({ pstatus: e.target.value, popen: "", ppage: "" })}>
              <option value="all">All Statuses</option>
              {Object.entries(PICKUP_STATUS).map(([v, [, l]]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            {vendors.data && (
              <Select className="w-auto bg-white" aria-label="Filter by seller" value={f.pvendor} onChange={(e) => setF({ pvendor: e.target.value, popen: "", ppage: "" })}>
                <option value="all">All Sellers</option>
                {vendors.data.results.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
            {!isDriver && (
              <Select className="w-auto bg-white" aria-label="Filter by rider" value={f.pdriver} onChange={(e) => setF({ pdriver: e.target.value, popen: "", ppage: "" })}>
                <option value="all">All Riders</option>
                {drivers.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Store className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No pickups found</p>
          <p className="text-gray-500 text-sm mt-2">Collections from sellers appear here when a marketplace order includes their items.</p>
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
                  : rows.map((t) => (
                      <PickupRow key={t.id} task={t} open={expanded === t.id} toggle={() => setF({ popen: expanded === t.id ? "" : String(t.id) })} />
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
              onPageChange={(p) => setF({ ppage: String(p), popen: "" })}
              disabled={list.isFetching}
            />
          )}
        </Card>
      )}
    </>
  );
}

function PickupRow({ task: t, open, toggle }: { task: PickupTask; open: boolean; toggle: () => void }) {
  return (
    <React.Fragment>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <div className="font-semibold text-gray-900 whitespace-nowrap">{t.reference}</div>
          <div className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(t.created_at)}</div>
        </td>
        <td className="px-6 py-4">
          <Link href={`/orders/ecommerce?search=${encodeURIComponent(t.order.reference)}&open=${t.order.id}`} className="text-blue-600 hover:text-blue-800 whitespace-nowrap">
            {t.order.reference}
          </Link>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Store className="size-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-900 whitespace-nowrap">{t.vendor?.name ?? "AGIZA"}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="min-w-48 max-w-xs">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-900">{t.origin.name}</span>
            </div>
            <div className="text-xs text-gray-500 ml-6">
              {[t.origin.address, t.origin.city].filter(Boolean).join(", ")}
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Warehouse className="size-4 text-gray-400 flex-shrink-0" />
            <div>
              <div className="text-gray-900 whitespace-nowrap">{t.destination.name}</div>
              <div className="text-xs text-gray-500">{t.destination.city}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          {t.driver ? (
            <div>
              <div className="text-gray-900 whitespace-nowrap">{t.driver.name}</div>
              {t.scheduled_at && <div className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(t.scheduled_at)}</div>}
            </div>
          ) : (
            <span className="text-sm text-gray-500 italic">Unassigned</span>
          )}
        </td>
        <td className="px-6 py-4">
          <PickupStatusBadge status={t.status} label={t.status_display} />
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${t.reference}`}
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
            <PickupDetails task={t} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

/* ---------------------------------------------------------------- details */

type PickupDialog = "assign" | "collected" | "at_hub" | "failed" | null;

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-gray-600">{label}</p>
      <div className="font-medium text-gray-900 break-words">{children || "—"}</div>
    </div>
  );
}

/** Expanded pickup: where to collect, the events timeline and the rider actions. */
export function PickupDetails({ task: t }: { task: PickupTask }) {
  const { canEdit, canManage } = useDeliveryAccess();
  const [dialog, setDialog] = useState<PickupDialog>(null);
  const close = () => setDialog(null);
  const canAssign = canManage && (t.status === "ready" || t.status === "failed");
  const canCollect = canEdit && t.status === "assigned";
  const canFail = canEdit && t.status === "assigned";
  const canHub = canEdit && t.status === "collected";
  const btn = "w-full px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Collection</h4>
        <div className="bg-white p-4 rounded border border-gray-200 space-y-2">
          <Info label="Collect from">
            {t.origin.name}
            <span className="block text-sm font-normal text-gray-600">{[t.origin.address, t.origin.city].filter(Boolean).join(", ")}</span>
            {t.origin.phone && (
              <a href={`tel:${t.origin.phone}`} className="inline-flex items-center gap-1 text-sm font-normal text-blue-600 hover:text-blue-800">
                <Phone className="size-3.5" /> {t.origin.phone}
              </a>
            )}
          </Info>
          <Info label="Deliver to">
            {t.destination.name} <span className="text-sm font-normal text-gray-600">· {t.destination.city}</span>
          </Info>
          {t.scheduled_at && <Info label="Scheduled">{formatDateTime(t.scheduled_at)}</Info>}
          {t.collected_at && (
            <Info label="Collected">
              {formatDateTime(t.collected_at)}
              {t.handed_over_by && <span className="block text-sm font-normal text-gray-600">Handed over by {t.handed_over_by}</span>}
            </Info>
          )}
          {t.arrived_at && <Info label="Arrived at hub">{formatDateTime(t.arrived_at)}</Info>}
          {t.notes && <Info label="Notes"><span className="font-normal text-sm whitespace-pre-line">{t.notes}</span></Info>}
        </div>
      </div>
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Timeline</h4>
        <PickupTimeline task={t} />
      </div>
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Actions</h4>
        <div className="space-y-2">
          {canAssign && (
            <button type="button" className={cn(btn, "bg-blue-600 text-white hover:bg-blue-700")} onClick={() => setDialog("assign")}>
              <UserCheck className="size-4" /> Assign Rider
            </button>
          )}
          {canCollect && (
            <button type="button" className={cn(btn, "bg-purple-600 text-white hover:bg-purple-700")} onClick={() => setDialog("collected")}>
              <PackageCheck className="size-4" /> Mark Collected
            </button>
          )}
          {canHub && (
            <button type="button" className={cn(btn, "bg-green-600 text-white hover:bg-green-700")} onClick={() => setDialog("at_hub")}>
              <Warehouse className="size-4" /> Mark at Hub
            </button>
          )}
          {canFail && (
            <button type="button" className={cn(btn, "bg-red-50 text-red-700 hover:bg-red-100")} onClick={() => setDialog("failed")}>
              <XCircle className="size-4" /> Mark Failed
            </button>
          )}
          {!canAssign && !canCollect && !canHub && !canFail && (
            <p className="text-sm text-gray-500">
              {t.status === "pending"
                ? "Waiting for the seller to mark the items ready."
                : t.status === "at_hub"
                  ? "The items are at the hub."
                  : t.status === "cancelled"
                    ? "This collection was cancelled."
                    : canEdit
                      ? "No action available."
                      : "You have view-only access to pickups."}
            </p>
          )}
        </div>
      </div>
      <AssignPickupDialog task={t} open={dialog === "assign"} onClose={close} />
      <AdvancePickupDialog task={t} mode={dialog === "collected" || dialog === "failed" ? dialog : null} onClose={close} />
      <AtHubConfirm task={t} open={dialog === "at_hub"} onClose={close} />
    </div>
  );
}

function PickupTimeline({ task: t }: { task: PickupTask }) {
  if (!t.events.length) return <div className="bg-white p-4 rounded border border-gray-200 text-sm text-gray-500">No events yet.</div>;
  return (
    <ol className="bg-white p-4 rounded border border-gray-200 space-y-3">
      {t.events.map((e, i) => {
        const last = i === t.events.length - 1;
        return (
          <li key={`${e.at}-${i}`} className="flex items-start gap-2">
            <div className={cn("size-3 rounded-full mt-1 flex-shrink-0", last ? "bg-blue-600" : "bg-gray-300")} />
            <div className="min-w-0">
              <span className={cn("text-sm", last ? "font-semibold text-gray-900" : "text-gray-700")}>{statusLabel(e.to)}</span>
              <span className="block text-xs text-gray-500">
                {formatDateTime(e.at)} · {e.by}
              </span>
              {e.note && <span className="block text-xs text-gray-600 italic break-words">{e.note}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- dialogs */

function AssignPickupDialog({ task, open, onClose }: { task: PickupTask; open: boolean; onClose: () => void }) {
  const drivers = useQuery({ queryKey: deliveryKeys.drivers, queryFn: deliveriesApi.drivers, enabled: open, staleTime: 60_000 });
  const [driver, setDriver] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setDriver(task.driver ? String(task.driver.id) : "");
      setScheduled(toLocalInput(task.scheduled_at));
      setError(null);
      setLocal({});
    }
  }, [open, task.driver, task.scheduled_at]);
  const assign = useApiMutation(() => deliveriesApi.pickups.assign(task.id, { driver: Number(driver), scheduled_at: fromLocalInput(scheduled) }), {
    invalidate: INVALIDATE,
    success: (t) => `${t.reference}: ${t.driver?.name ?? "rider"} assigned`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!driver) return setLocal({ driver: "Choose a rider." });
    setLocal({});
    assign.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign Rider — ${task.reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={assign.isPending}>
            Assign Rider
          </Button>
          <Button variant="muted" onClick={onClose} disabled={assign.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Collect from <strong>{task.origin.name}</strong> ({task.origin.city}) and bring to <strong>{task.destination.name}</strong>.
        </p>
        <Field label="Rider" required htmlFor="pk-driver" error={fe.driver}>
          <Select id="pk-driver" value={driver} onChange={(e) => setDriver(e.target.value)} disabled={drivers.isPending}>
            <option value="">{drivers.isPending ? "Loading riders…" : "Select a rider"}</option>
            {drivers.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        </Field>
        {drivers.data?.length === 0 && <p className="text-sm text-gray-500">No active drivers. Add them under People.</p>}
        <Field label="Collection date & time" htmlFor="pk-sched" error={fe.scheduled_at} hint="Optional">
          <Input id="pk-sched" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["driver", "scheduled_at"]} />
      </div>
    </Modal>
  );
}

function AdvancePickupDialog({ task, mode, onClose }: { task: PickupTask; mode: "collected" | "failed" | null; onClose: () => void }) {
  const [handedOver, setHandedOver] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (mode) {
      setHandedOver("");
      setNote("");
      setError(null);
      setLocal({});
    }
  }, [mode]);
  const advance = useApiMutation(
    () => deliveriesApi.pickups.advance(task.id, mode === "collected" ? { status: "collected", handed_over_by: handedOver.trim(), note: note.trim() } : { status: "failed", note: note.trim() }),
    {
      invalidate: INVALIDATE,
      success: (t) => `${t.reference}: ${t.status_display}`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const submit = () => {
    if (mode === "collected" && !handedOver.trim()) return setLocal({ handed_over_by: "Enter who handed the items over." });
    if (mode === "failed" && !note.trim()) return setLocal({ note: "Say why the collection failed." });
    setLocal({});
    advance.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const collected = mode === "collected";
  return (
    <Modal
      open={Boolean(mode)}
      onClose={onClose}
      title={`${collected ? "Mark Collected" : "Mark Failed"} — ${task.reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" variant={collected ? "primary" : "danger"} onClick={submit} loading={advance.isPending}>
            {collected ? "Mark Collected" : "Mark Failed"}
          </Button>
          <Button variant="muted" onClick={onClose} disabled={advance.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {collected ? (
          <>
            <p className="text-sm text-gray-600">Proof of collection: record the person at {task.origin.name} who handed the items to the rider.</p>
            <Field label="Handed over by" required htmlFor="pk-handed" error={fe.handed_over_by}>
              <Input id="pk-handed" maxLength={150} value={handedOver} onChange={(e) => setHandedOver(e.target.value)} placeholder="Name (and role) of the seller's staff" invalid={Boolean(fe.handed_over_by)} />
            </Field>
            <Field label="Note (optional)" htmlFor="pk-note" error={fe.note}>
              <Textarea id="pk-note" rows={2} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600">Delivery staff are notified. The pickup can then be assigned again or cancelled.</p>
            <Field label="Reason" required htmlFor="pk-reason" error={fe.note}>
              <Textarea id="pk-reason" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Shop closed, items not ready" />
            </Field>
          </>
        )}
        <FormAlert error={error} shown={["handed_over_by", "note"]} />
      </div>
    </Modal>
  );
}

function AtHubConfirm({ task, open, onClose }: { task: PickupTask; open: boolean; onClose: () => void }) {
  const advance = useApiMutation(() => deliveriesApi.pickups.advance(task.id, { status: "at_hub" }), {
    invalidate: INVALIDATE,
    success: (t) => `${t.reference}: ${t.status_display}`,
    onSuccess: onClose,
  });
  return (
    <ConfirmDialog
      open={open}
      title={`Mark ${task.reference} at hub?`}
      message={<>The items from {task.vendor?.name ?? task.origin.name} arrived at {task.destination.name}. Once every pickup of {task.order.reference} is at the hub, the order can ship.</>}
      confirmLabel="Mark at Hub"
      tone="success"
      pending={advance.isPending}
      onConfirm={() => advance.mutate(undefined)}
      onClose={onClose}
    />
  );
}

/* ------------------------------------------------------- shop order block */

/** The collection legs of one shop order (shown in its expanded row). */
export function OrderPickups({ orderId }: { orderId: number }) {
  const query = { order: orderId, page_size: 50 };
  const pickups = useQuery({
    queryKey: deliveryKeys.pickups(query),
    queryFn: ({ signal }) => deliveriesApi.pickups.list(query, signal),
    retry: false,
  });
  const rows = pickups.data?.results ?? [];
  // No pickups (e.g. AGIZA-only orders) or no Deliveries access: show nothing.
  if (!rows.length) return null;
  const waiting = rows.filter((r) => r.status !== "at_hub" && r.status !== "cancelled");
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h4 className="font-semibold text-gray-900">Pickups</h4>
        {waiting.length > 0 && <p className="text-xs text-amber-700">The order ships once every pickup is at the hub.</p>}
      </div>
      <ul className="bg-white rounded border border-gray-200 divide-y divide-gray-100">
        {rows.map((t) => (
          <li key={t.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href={`/deliveries?view=pickups&psearch=${encodeURIComponent(t.reference)}&popen=${t.id}`}
              className="font-mono text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              {t.reference}
            </Link>
            <PickupStatusBadge status={t.status} label={t.status_display} />
            <span className="text-sm text-gray-700 inline-flex items-center gap-1">
              <Store className="size-4 text-gray-400" /> {t.vendor?.name ?? t.origin.name}
            </span>
            <span className="text-sm text-gray-600 inline-flex items-center gap-1">
              <Truck className="size-4 text-gray-400" /> {t.driver?.name ?? <span className="italic text-gray-500">No rider yet</span>}
            </span>
            {t.collected_at && (
              <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Collected {formatDateTime(t.collected_at)}
                {t.handed_over_by && ` from ${t.handed_over_by}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
