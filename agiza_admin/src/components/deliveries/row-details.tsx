"use client";

import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import { deliveriesApi, deliveryKeys, type Delivery, type DeliveryStatus } from "@/lib/api/services/deliveries";
import { formatDateTime } from "@/lib/format";

import { useDeliveryAccess } from "./access";
import { AddProofDialog, AssignDriverDialog, CompleteDeliveryDialog, StatusDialog, type StatusMode } from "./action-dialogs";

const DOT: Record<DeliveryStatus, string> = {
  pending: "bg-yellow-500",
  assigned_driver: "bg-blue-600",
  out_for_delivery: "bg-purple-600",
  delivered: "bg-green-600",
  failed: "bg-red-600",
  rescheduled: "bg-orange-500",
  returned: "bg-gray-500",
  cancelled: "bg-gray-400",
};

const btnPrimary = "w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:bg-gray-300 disabled:cursor-not-allowed";
const btnSuccess = "w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium";
const btnSecondary = "w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";
const btnDanger = "w-full bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium";

/* ----------------------------------------------------------- proof panel */

function emptyProofText(status: DeliveryStatus): string {
  switch (status) {
    case "pending":
    case "assigned_driver":
      return "Delivery has not started yet";
    case "failed":
      return "Delivery attempt failed";
    case "returned":
      return "Delivery was returned";
    case "cancelled":
      return "Delivery was cancelled";
    case "delivered":
      return "Delivered without recorded proof";
    default:
      return "Delivery in progress";
  }
}

/** "Delivery Proof" panel, as in the design (signature, completed at, notes, photo grid). */
function ProofPanel({ delivery }: { delivery: Delivery }) {
  const proof = delivery.proof;
  if (!proof || (!proof.signature_name && proof.photos.length === 0)) {
    return (
      <div className="text-center py-8 bg-gray-100 rounded-lg">
        <Package className="size-12 mx-auto mb-2 text-gray-400" />
        <p className="text-gray-600">No delivery proof available</p>
        <p className="text-sm text-gray-500 mt-1">{emptyProofText(delivery.status)}</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="font-semibold text-gray-900 mb-4">Delivery Proof</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          {proof.signature_name && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Signature</p>
              <p className="text-gray-900">{proof.signature_name}</p>
              {proof.signature_url && (
                // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL
                <img src={fileSrc(proof.signature_url)} alt={`Signature of ${proof.signature_name}`} className="mt-2 border border-gray-200 rounded max-w-xs w-full bg-white" />
              )}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Completed At</p>
            <p className="text-gray-900">{formatDateTime(proof.completed_at ?? delivery.delivered_at)}</p>
            {proof.recorded_by && <p className="text-xs text-gray-500 mt-0.5">Recorded by {proof.recorded_by.full_name}</p>}
          </div>
          {proof.notes && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Notes</p>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-gray-800">{proof.notes}</p>
              </div>
            </div>
          )}
        </div>
        {proof.photos.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Delivery Photos</p>
            <div className="grid grid-cols-2 gap-3">
              {proof.photos.map((photo, index) => (
                <div key={photo.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL */}
                  <img src={fileSrc(photo.url)} alt={`Delivery proof ${index + 1}`} className="w-full h-40 object-cover rounded-lg border border-gray-200 shadow-sm" />
                  <button
                    type="button"
                    onClick={() => window.open(fileSrc(photo.url), "_blank", "noopener,noreferrer")}
                    aria-label={`View delivery proof photo ${index + 1} full size`}
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/30 focus-visible:bg-black/30 transition-all rounded-lg flex items-center justify-center"
                  >
                    <span className="text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 text-sm font-medium">View Full Size</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- details */

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-gray-600">{label}</p>
      <div className="font-medium text-gray-900 break-words">{children}</div>
    </div>
  );
}

function DetailsBox({ delivery: d }: { delivery: Delivery }) {
  return (
    <div className="bg-white p-4 rounded border border-gray-200 space-y-2">
      <InfoRow label="Scheduled">{formatDateTime(d.scheduled_at)}</InfoRow>
      <InfoRow label="Recipient">
        {d.recipient_name || d.customer.full_name}
        {(d.recipient_phone || d.customer.phone) && <span className="block text-sm font-normal text-gray-600">{d.recipient_phone || d.customer.phone}</span>}
      </InfoRow>
      {(d.pickup_point || d.pickup_warehouse) && <InfoRow label="Pickup Point">{d.pickup_point || d.pickup_warehouse?.name}</InfoRow>}
      <InfoRow label="Delivery Address">
        {d.delivery_address}
        {(d.destination_area || d.destination_city) && (
          <span className="block text-sm font-normal text-gray-600">{[d.destination_area, d.destination_city?.name].filter(Boolean).join(", ")}</span>
        )}
      </InfoRow>
      <InfoRow label="Order">
        {d.order.reference} <span className="text-sm font-normal text-gray-600">· {d.order.status_display}</span>
      </InfoRow>
      {d.attempts > 0 && <InfoRow label="Failed Attempts">{d.attempts}</InfoRow>}
      {d.notes && (
        <div>
          <p className="text-sm text-gray-600 mb-1">Notes</p>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-800 whitespace-pre-line">{d.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function EventHistory({ delivery }: { delivery: Delivery }) {
  const events = useQuery({ queryKey: deliveryKeys.events(delivery.id), queryFn: () => deliveriesApi.events(delivery.id) });
  return (
    <div className="bg-white p-4 rounded border border-gray-200">
      {events.isPending ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : events.isError ? (
        <div className="text-sm text-red-600" role="alert">
          {errorText(events.error)}{" "}
          <button type="button" onClick={() => events.refetch()} className="font-medium text-blue-600 hover:text-blue-800">
            Retry
          </button>
        </div>
      ) : events.data.length === 0 ? (
        <p className="text-sm text-gray-500">No events yet.</p>
      ) : (
        <ol className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {events.data.map((e, i) => {
            const isLast = i === events.data.length - 1;
            const statusChange = e.from_status !== e.to_status;
            return (
              <li key={e.id} className="flex gap-2">
                <div className={cn("size-3 rounded-full mt-1 flex-shrink-0", isLast ? DOT[e.to_status as DeliveryStatus] ?? "bg-gray-400" : "bg-gray-300")} />
                <div className="min-w-0">
                  <p className={cn("text-sm", isLast ? "font-medium text-gray-900" : "text-gray-700")}>
                    {statusChange ? e.to_status_display : "Update"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateTime(e.created_at)} · {e.changed_by?.full_name ?? "System"}
                  </p>
                  {e.note && <p className="text-xs text-gray-700 mt-0.5 italic break-words">{e.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- actions */

function Actions({ delivery }: { delivery: Delivery }) {
  const { canEdit, canManage } = useDeliveryAccess();
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [mode, setMode] = useState<StatusMode | null>(null);
  const allowed = new Set(delivery.allowed_transitions.map((t) => t.value));
  const s = delivery.status;
  const isExpress = delivery.order.order_type === "express";

  if (!canEdit) return <p className="text-sm text-gray-500">You have view-only access to deliveries.</p>;

  const canAssign = canManage && ["pending", "rescheduled", "assigned_driver", "out_for_delivery"].includes(s);
  const buttons: React.ReactNode[] = [];
  if (s === "out_for_delivery")
    buttons.push(
      <button key="complete" type="button" className={btnSuccess} onClick={() => setCompleteOpen(true)}>
        Complete Delivery
      </button>,
    );
  if (allowed.has("out_for_delivery"))
    buttons.push(
      <button
        key="out"
        type="button"
        className={btnPrimary}
        onClick={() => setMode("out_for_delivery")}
        disabled={!delivery.driver}
        title={delivery.driver ? undefined : "Assign a driver first"}
      >
        Mark Out for Delivery
      </button>,
    );
  if (canAssign)
    buttons.push(
      <button key="assign" type="button" className={s === "pending" || (s === "rescheduled" && !delivery.driver) ? btnPrimary : btnSecondary} onClick={() => setAssignOpen(true)}>
        {delivery.driver ? "Change Driver" : "Assign Driver"}
      </button>,
    );
  if (allowed.has("rescheduled"))
    buttons.push(
      <button key="resched" type="button" className={btnSecondary} onClick={() => setMode("rescheduled")}>
        Reschedule
      </button>,
    );
  if (allowed.has("failed"))
    buttons.push(
      <button key="failed" type="button" className={btnDanger} onClick={() => setMode("failed")}>
        Mark Failed
      </button>,
    );
  if (allowed.has("returned"))
    buttons.push(
      <button key="returned" type="button" className={btnDanger} onClick={() => setMode("returned")}>
        Mark Returned
      </button>,
    );
  if (allowed.has("cancelled") && !isExpress)
    buttons.push(
      <button key="cancel" type="button" className={btnDanger} onClick={() => setMode("cancelled")}>
        Cancel Delivery
      </button>,
    );
  if (s === "delivered")
    buttons.push(
      <button key="proof" type="button" className={btnSecondary} onClick={() => setProofOpen(true)}>
        {delivery.proof?.signature_name ? "Add Delivery Photos" : "Add Delivery Proof"}
      </button>,
    );

  return (
    <>
      {buttons.length ? <div className="space-y-2">{buttons}</div> : <p className="text-sm text-gray-500">No further actions — this delivery is closed.</p>}
      {allowed.has("out_for_delivery") && !delivery.driver && (
        <p className="text-xs text-gray-500 mt-3">Assign a driver before marking the delivery out for delivery.</p>
      )}
      {isExpress && s !== "delivered" && s !== "cancelled" && (
        <p className="text-xs text-gray-500 mt-3">Express order: progress and cancellation are also driven from Express Delivery.</p>
      )}
      <AssignDriverDialog delivery={delivery} open={assignOpen} onClose={() => setAssignOpen(false)} />
      <StatusDialog delivery={delivery} mode={mode} onClose={() => setMode(null)} />
      <CompleteDeliveryDialog delivery={delivery} open={completeOpen} onClose={() => setCompleteOpen(false)} />
      <AddProofDialog delivery={delivery} open={proofOpen} onClose={() => setProofOpen(false)} />
    </>
  );
}

/** Expanded "Details" row of the Deliveries table. */
export function DeliveryRowDetails({ delivery }: { delivery: Delivery }) {
  return (
    <div className="space-y-6">
      <ProofPanel delivery={delivery} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Delivery Details</h4>
          <DetailsBox delivery={delivery} />
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Delivery History</h4>
          <EventHistory delivery={delivery} />
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Actions</h4>
          <Actions delivery={delivery} />
        </div>
      </div>
    </div>
  );
}
