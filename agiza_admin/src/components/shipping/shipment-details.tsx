"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit2,
  History,
  MapPin,
  Navigation,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { shippingApi, shippingKeys, type Shipment, type ShipmentOrder } from "@/lib/api/services/shipping";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";

import { num, useShippingMutation } from "./shared";
import { AlertDialog, DocumentsGrid, EditShipmentDialog, StatusDialog, TrackingDialog, UploadDocumentForm } from "./shipment-dialogs";

type Dialog = "status" | "tracking" | "alert" | "edit" | "cancel" | "clear-alert" | null;

const OPEN = new Set(["created", "booked"]);

function milestoneDate(m: ShipmentOrder["timeline"][number]): string {
  if (m.at) return formatDate(m.at);
  if (m.expected) return `Expected ${formatDate(m.expected)}`;
  return "Pending";
}

function EventsList({ shipment }: { shipment: Shipment }) {
  const events = useQuery({
    queryKey: shippingKeys.events(shipment.id),
    queryFn: () => shippingApi.shipments.events(shipment.id),
  });
  if (events.isPending) {
    return (
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (events.isError) {
    return (
      <p className="text-sm text-red-600">
        Couldn&apos;t load tracking history.{" "}
        <button type="button" className="font-medium underline" onClick={() => events.refetch()}>
          Retry
        </button>
      </p>
    );
  }
  if (!events.data.length) return <p className="text-sm text-gray-500">No tracking events yet.</p>;
  return (
    <ol className="space-y-2">
      {[...events.data].reverse().map((e) => (
        <li key={e.id} className="flex gap-3 p-3 bg-white border border-gray-200 rounded-lg">
          <div
            className={cn(
              "size-8 rounded-full flex items-center justify-center flex-shrink-0",
              e.kind === "status" ? "bg-blue-100 text-blue-600" : e.kind === "alert" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600",
            )}
          >
            {e.kind === "status" ? <CheckCircle2 className="size-4" /> : e.kind === "alert" ? <AlertTriangle className="size-4" /> : <Navigation className="size-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {e.kind === "status" && e.to_status_display && e.description !== e.to_status_display ? `${e.to_status_display}: ${e.description}` : e.description || e.kind_display}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDateTime(e.occurred_at)}
              {e.location && (
                <>
                  {" · "}
                  <MapPin className="inline size-3 -mt-0.5" /> {e.location}
                </>
              )}
              {e.created_by && <> · {e.created_by.full_name}</>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Expanded Shipments row: orders with milestone timelines, documents, actions and tracking history. */
export function ShipmentDetails({ shipment, canEdit }: { shipment: Shipment; canEdit: boolean }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [removing, setRemoving] = useState<ShipmentOrder | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const close = () => setDialog(null);

  const isOpen = OPEN.has(shipment.status);
  const final = shipment.status === "completed" || shipment.status === "cancelled";
  const canAdvance = shipment.allowed_transitions.some((t) => t.value !== "cancelled");
  const canCancel = shipment.allowed_transitions.some((t) => t.value === "cancelled");

  const cancel = useShippingMutation(() => shippingApi.shipments.transition(shipment.id, { status: "cancelled", note: "Shipment cancelled" }), {
    success: `${shipment.cargo_id} cancelled — its orders are back in Ready for Shipment`,
    onSuccess: close,
  });
  const clearAlert = useShippingMutation(() => shippingApi.shipments.update(shipment.id, { alert: "" }), {
    success: "Alert cleared",
    onSuccess: close,
  });
  const remove = useShippingMutation((parcel: number) => shippingApi.shipments.removeParcel(shipment.id, parcel), {
    success: "Order removed from shipment",
    onSuccess: () => setRemoving(null),
  });

  return (
    <div className="space-y-6">
      {canEdit && !final && (
        <div className="flex flex-wrap gap-2">
          {canAdvance && (
            <Button size="sm" onClick={() => setDialog("status")}>
              <RefreshCw className="size-4" /> Update Status
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setDialog("tracking")}>
            <Navigation className="size-4" /> Add Tracking Update
          </Button>
          {shipment.alert ? (
            <Button size="sm" variant="outline" onClick={() => setDialog("clear-alert")}>
              <CheckCircle2 className="size-4 text-green-600" /> Clear Alert
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setDialog("alert")}>
              <AlertTriangle className="size-4 text-red-600" /> Set Alert
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>
            <Edit2 className="size-4" /> Edit ETA / Tracking
          </Button>
          {canCancel && (
            <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setDialog("cancel")}>
              <XCircle className="size-4" /> Cancel Shipment
            </Button>
          )}
        </div>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div className="p-3 bg-white border border-gray-200 rounded-lg">
          <dt className="text-gray-500">Master Tracking #</dt>
          <dd className="font-mono text-gray-900 mt-1 break-all">{shipment.master_tracking_number || "—"}</dd>
        </div>
        <div className="p-3 bg-white border border-gray-200 rounded-lg">
          <dt className="text-gray-500">Shipping Method</dt>
          <dd className="text-gray-900 mt-1">{shipment.shipping_method.name}</dd>
        </div>
        <div className="p-3 bg-white border border-gray-200 rounded-lg">
          <dt className="text-gray-500">Origin Warehouse</dt>
          <dd className="text-gray-900 mt-1">{shipment.origin_warehouse ? `${shipment.origin_warehouse.name} (${shipment.origin_warehouse.code})` : "—"}</dd>
        </div>
        <div className="p-3 bg-white border border-gray-200 rounded-lg">
          <dt className="text-gray-500">Departed / Arrived</dt>
          <dd className="text-gray-900 mt-1">
            {formatDate(shipment.departed_at)} / {formatDate(shipment.arrived_at)}
          </dd>
        </div>
        {shipment.notes && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg sm:col-span-2 lg:col-span-4">
            <dt className="text-blue-900 font-medium">Notes</dt>
            <dd className="text-gray-800 mt-1 whitespace-pre-line">{shipment.notes}</dd>
          </div>
        )}
      </dl>

      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900">Orders in Shipment</h4>
        {shipment.orders.length === 0 && <p className="text-sm text-gray-500">No orders in this shipment.</p>}
        {shipment.orders.map((order) => (
          <div key={order.parcel_id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div>
                <span className="font-semibold text-gray-900">{order.reference}</span>
                <span className="text-gray-600 ml-3">
                  {num(order.weight_kg)}kg / {num(order.cbm)}m³
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  {order.customer} · {order.item_name}
                </p>
              </div>
              {canEdit && isOpen && (
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setRemoving(order)}>
                  <Trash2 className="size-4" /> Remove
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Timeline:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {order.timeline.map((m) => (
                  <div key={m.key} className={cn("p-2 rounded-lg", m.status === "completed" ? "bg-green-50" : "bg-gray-100")}>
                    <div className="flex items-center gap-2">
                      {m.status === "completed" ? <CheckCircle2 className="size-4 text-green-600 flex-shrink-0" /> : <Clock className="size-4 text-gray-400 flex-shrink-0" />}
                      <span className="text-xs font-medium text-gray-900">{m.label}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{milestoneDate(m)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div id={`shipment-${shipment.id}-documents`}>
        <h4 className="font-semibold text-gray-900 mb-2">Documents</h4>
        <DocumentsGrid shipment={shipment} />
        {canEdit && shipment.status !== "cancelled" && (
          <div className="mt-3">
            <UploadDocumentForm shipment={shipment} />
          </div>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          <History className="size-4" /> {showHistory ? "Hide tracking history" : "Show tracking history"}
        </button>
        {showHistory && (
          <div className="mt-3">
            <EventsList shipment={shipment} />
          </div>
        )}
      </div>

      {dialog === "status" && <StatusDialog shipment={shipment} onClose={close} />}
      {dialog === "tracking" && <TrackingDialog shipment={shipment} onClose={close} />}
      {dialog === "alert" && <AlertDialog shipment={shipment} onClose={close} />}
      {dialog === "edit" && <EditShipmentDialog shipment={shipment} onClose={close} />}
      <ConfirmDialog
        open={dialog === "cancel"}
        title="Cancel Shipment"
        tone="danger"
        confirmLabel="Cancel Shipment"
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined)}
        onClose={close}
        message={
          <>
            Cancel <strong>{shipment.cargo_id}</strong> ({shipment.shipment_number})? Its {shipment.orders.length} order(s) go back to Ready for
            Shipment. This can&apos;t be undone.
          </>
        }
      />
      <ConfirmDialog
        open={dialog === "clear-alert"}
        title="Clear Alert"
        tone="success"
        confirmLabel="Clear Alert"
        pending={clearAlert.isPending}
        onConfirm={() => clearAlert.mutate(undefined)}
        onClose={close}
        message={
          <>
            Mark <strong>{shipment.cargo_id}</strong> as All Good? The current alert ({shipment.alert_display}) will be cleared.
          </>
        }
      />
      <ConfirmDialog
        open={removing !== null}
        title="Remove Order"
        tone="danger"
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.parcel_id)}
        onClose={() => setRemoving(null)}
        message={
          <>
            Remove <strong>{removing?.reference}</strong> from {shipment.cargo_id}? It returns to Ready for Shipment.
          </>
        }
      />
    </div>
  );
}
