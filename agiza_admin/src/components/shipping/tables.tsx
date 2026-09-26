"use client";

import { ChevronDown, ChevronUp, Package2, PackageCheck, Paperclip } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useRef } from "react";

import { Card } from "@/components/ui/card";
import { TableSkeletonRows } from "@/components/ui/table";
import { fileSrc } from "@/lib/api/files";
import type { Parcel, Shipment } from "@/lib/api/services/shipping";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

import { AlertBadge, CargoTypeBadge, METHOD_LABEL, ShipmentStatusBadge, num } from "./shared";
import { ShipmentDetails } from "./shipment-details";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap";
const td = "px-6 py-4";

function OrderLink({ parcel }: { parcel: Parcel }) {
  return (
    <Link
      href={`/orders/international?open=${parcel.order.id}`}
      className="font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap"
      title={`${parcel.order.customer} · ${parcel.order.status_display}`}
    >
      {parcel.order.reference}
    </Link>
  );
}

function Checkbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" className="rounded size-4 cursor-pointer" checked={checked} onChange={onChange} aria-label={label} />;
}

/* -------------------------------------------------------- Ready for Shipment */

export function ReadyTable({
  rows,
  loading,
  selected,
  onToggle,
  onToggleAll,
  selectable,
  footer,
}: {
  rows: Parcel[];
  loading: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  selectable: boolean;
  footer?: React.ReactNode;
}) {
  const picked = rows.filter((r) => selected.has(r.id)).length;
  const all = rows.length > 0 && picked === rows.length;
  const headers = ["Order ID", "Shipper", "Origin", "Destination", "Weight/CBM", "Order Type", "Ready Date", "Exception Flags", "Shipping Method"];
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {selectable && (
                <th scope="col" className="px-6 py-4 text-left">
                  <Checkbox checked={all} indeterminate={picked > 0 && !all} onChange={onToggleAll} label="Select all orders on this page" />
                </th>
              )}
              {headers.map((h) => (
                <th key={h} scope="col" className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <TableSkeletonRows rows={5} columns={headers.length + (selectable ? 1 : 0)} />
            ) : (
              rows.map((p) => (
                <tr key={p.id} className={cn("hover:bg-gray-50 transition-colors", selected.has(p.id) && "bg-blue-50/50")}>
                  {selectable && (
                    <td className={td}>
                      <Checkbox checked={selected.has(p.id)} onChange={() => onToggle(p.id)} label={`Select ${p.order.reference}`} />
                    </td>
                  )}
                  <td className={td}><OrderLink parcel={p} /></td>
                  <td className={cn(td, "text-gray-900 whitespace-nowrap")}>{p.shipper?.name ?? <span className="text-gray-400">Not set</span>}</td>
                  <td className={td}><span className="text-gray-900 uppercase text-sm whitespace-nowrap">{p.origin.name}</span></td>
                  <td className={cn(td, "text-gray-900")}>{p.destination?.label ?? <span className="text-gray-400">Not set</span>}</td>
                  <td className={td}>
                    <div className="text-gray-900 whitespace-nowrap">
                      <div>{num(p.weight_kg)}kg / {num(p.cbm)}m³</div>
                      <div className="text-xs text-gray-500">({p.weight_type})</div>
                    </div>
                  </td>
                  <td className={td}><CargoTypeBadge type={p.cargo_type} label={p.cargo_type_display} /></td>
                  <td className={cn(td, "text-gray-900 text-sm whitespace-nowrap")}>{formatDate(p.received_at)}</td>
                  <td className={td}>
                    {p.exception_flags.length > 0 ? (
                      <div className="space-y-1">
                        {p.exception_flags.map((flag) => (
                          <span key={flag} className="inline-block px-2 py-1 bg-red-100 text-red-800 text-xs rounded mr-1 whitespace-nowrap">{flag}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-green-600 text-sm whitespace-nowrap">✓ No issues</span>
                    )}
                  </td>
                  <td className={td}>
                    {p.shipping_method ? (
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium whitespace-nowrap" title={p.shipping_method.name}>
                        {METHOD_LABEL[p.shipping_method.type]}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">Not set</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </Card>
  );
}

/* -------------------------------------------------------- Waiting to Receive */

export function WaitingTable({
  rows,
  loading,
  canEdit,
  onReceive,
  footer,
}: {
  rows: Parcel[];
  loading: boolean;
  canEdit: boolean;
  onReceive: (p: Parcel) => void;
  footer?: React.ReactNode;
}) {
  const headers = ["Order ID", "Supplier Tracking #", "Origin", "Shipper", "Order Type", "Source", "Item Name", "Description", "Packages Quantity", "Estimated Arrival", ...(canEdit ? ["Actions"] : [])];
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col" className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <TableSkeletonRows rows={5} columns={headers.length} />
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className={td}><OrderLink parcel={p} /></td>
                  <td className={cn(td, "whitespace-nowrap")}>{p.supplier_tracking_number || <span className="text-gray-400">—</span>}</td>
                  <td className={td}><span className="text-gray-900 uppercase text-sm whitespace-nowrap">{p.origin.name}</span></td>
                  <td className={cn(td, "text-gray-900 whitespace-nowrap")}>{p.shipper?.name ?? <span className="text-gray-400">Not set</span>}</td>
                  <td className={td}><CargoTypeBadge type={p.cargo_type} label={p.cargo_type_display} /></td>
                  <td className={td}>
                    <span
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                        p.source === "agiza_procured" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800",
                      )}
                    >
                      {p.source_display}
                    </span>
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2 min-w-48">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL, not optimisable
                        <img src={fileSrc(p.image)} alt={p.item_name} className="size-10 rounded object-cover flex-shrink-0" loading="lazy" />
                      ) : (
                        <div className="size-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0" aria-hidden>
                          <Package2 className="size-5 text-gray-400" />
                        </div>
                      )}
                      <span className="text-gray-900 font-medium">{p.item_name}</span>
                    </div>
                  </td>
                  <td className={cn(td, "text-gray-900 text-sm")}>
                    <div className="max-w-xs line-clamp-2" title={p.description}>{p.description || <span className="text-gray-400">—</span>}</div>
                  </td>
                  <td className={cn(td, "text-gray-900 text-sm")}>{p.packages_quantity}</td>
                  <td className={cn(td, "text-gray-900 text-sm whitespace-nowrap")}>{formatDate(p.estimated_arrival)}</td>
                  {canEdit && (
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => onReceive(p)}
                        className="text-green-600 hover:text-green-800 font-medium text-sm flex items-center gap-1 whitespace-nowrap"
                      >
                        <PackageCheck className="size-4" />
                        Receive
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </Card>
  );
}

/* ----------------------------------------------------------------- Shipments */

export function ShipmentsTable({
  rows,
  loading,
  expanded,
  onExpand,
  onDocuments,
  canEdit,
  footer,
}: {
  rows: Shipment[];
  loading: boolean;
  expanded: number | null;
  onExpand: (id: number | null) => void;
  onDocuments: (s: Shipment) => void;
  canEdit: boolean;
  footer?: React.ReactNode;
}) {
  const headers = ["Cargo ID", "Shipment #", "Shipper", "Status", "Weight/CBM", "Method", "Route", "ETA", "Alert", "Actions"];
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col" className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <TableSkeletonRows rows={5} columns={headers.length} />
            ) : (
              rows.map((s) => {
                const open = expanded === s.id;
                return (
                  <React.Fragment key={s.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className={td}>
                        <div className="font-semibold text-gray-900 whitespace-nowrap">{s.cargo_id}</div>
                        <div className="text-xs text-gray-500">{s.orders.length} order(s)</div>
                      </td>
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => onExpand(open ? null : s.id)}
                          aria-expanded={open}
                          aria-controls={`shipment-${s.id}-details`}
                          className="font-mono text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 whitespace-nowrap"
                        >
                          {s.shipment_number}
                          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </button>
                      </td>
                      <td className={cn(td, "text-gray-900 whitespace-nowrap")}>{s.shipper.name}</td>
                      <td className={td}><ShipmentStatusBadge status={s.status} label={s.status_display} /></td>
                      <td className={td}>
                        <div className="text-gray-900 whitespace-nowrap">
                          <div>{num(s.weight_kg)}kg</div>
                          <div className="text-sm text-gray-600">{num(s.cbm)}m³</div>
                        </div>
                      </td>
                      <td className={td}>
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium uppercase whitespace-nowrap" title={s.shipping_method.name}>
                          {s.shipping_method.type}
                        </span>
                      </td>
                      <td className={td}>
                        <div className="text-gray-900 text-sm">
                          <div className="uppercase font-medium whitespace-nowrap">{s.origin.name}</div>
                          <div className="text-gray-500 whitespace-nowrap">→ {s.destination.label}</div>
                        </div>
                      </td>
                      <td className={cn(td, "text-gray-900 text-sm whitespace-nowrap")}>{formatDate(s.eta)}</td>
                      <td className={td}><AlertBadge alert={s.alert} label={s.alert_display} /></td>
                      <td className={td}>
                        <button
                          type="button"
                          onClick={() => onDocuments(s)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 whitespace-nowrap"
                        >
                          <Paperclip className="size-4" />
                          Documents{s.documents.length > 0 && ` (${s.documents.length})`}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr id={`shipment-${s.id}-details`}>
                        <td colSpan={headers.length} className="px-6 py-4 bg-gray-50">
                          <ShipmentDetails shipment={s} canEdit={canEdit} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </Card>
  );
}
