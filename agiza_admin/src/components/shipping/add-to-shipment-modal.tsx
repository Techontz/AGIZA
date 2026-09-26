"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ship } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ErrorState } from "@/components/ui/states";
import { shippingApi, shippingKeys, type Parcel, type Shipment } from "@/lib/api/services/shipping";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

import { FormErrorBox, ShipmentStatusBadge, num, useFormErrors, useShippingMutation } from "./shared";

/** Add the selected Ready-for-Shipment parcels to an open (created/booked) shipment from the same origin. */
export function AddToShipmentModal({
  parcels,
  onClose,
  onAdded,
}: {
  parcels: Parcel[];
  onClose: () => void;
  onAdded: (s: Shipment) => void;
}) {
  const origins = [...new Set(parcels.map((p) => p.origin.iso2))];
  const mixed = origins.length > 1;
  const query = { status: "created,booked", origin: origins[0], page_size: 100 };
  const open = useQuery({
    queryKey: shippingKeys.shipments({ ...query, purpose: "add-parcels" }),
    queryFn: ({ signal }) => shippingApi.shipments.list(query, signal),
    enabled: !mixed && origins.length === 1,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const { errors, onError, reset } = useFormErrors();

  const add = useShippingMutation((id: number) => shippingApi.shipments.addParcels(id, parcels.map((p) => p.id)), {
    success: (s) => `${parcels.length} order(s) added to ${s.cargo_id}`,
    onSuccess: onAdded,
    onError,
  });

  const rows = open.data?.results ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Add to Existing Shipment"
      size="2xl"
      footer={
        <>
          <Button
            className="flex-1"
            disabled={selected === null || mixed}
            loading={add.isPending}
            onClick={() => {
              if (selected === null) return;
              reset();
              add.mutate(selected);
            }}
          >
            Add {parcels.length} Order(s)
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <FormErrorBox errors={errors} fields={[]} />
      <p className="text-sm text-gray-600 mb-4">
        Orders: <span className="font-medium text-gray-900">{parcels.map((p) => p.order.reference).join(", ")}</span>
      </p>

      {mixed ? (
        <div role="alert" className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
          The selected orders come from different origins ({origins.join(", ")}). Select orders from one origin.
        </div>
      ) : open.isError ? (
        <ErrorState bare message={(open.error as Error).message} onRetry={() => open.refetch()} />
      ) : open.isPending ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center">
          <Ship className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No open shipments</p>
          <p className="text-gray-500 text-sm mt-2">
            There are no Created or Booked shipments from {parcels[0]?.origin.name}. Create a new shipment instead.
          </p>
        </div>
      ) : (
        <fieldset className="space-y-3">
          <legend className="sr-only">Open shipments</legend>
          {rows.map((s) => (
            <label
              key={s.id}
              className={cn(
                "flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors",
                selected === s.id ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:bg-gray-50",
              )}
            >
              <input
                type="radio"
                name="shipment"
                className="mt-1"
                checked={selected === s.id}
                onChange={() => setSelected(s.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{s.cargo_id}</span>
                  <span className="font-mono text-sm text-blue-600">{s.shipment_number}</span>
                  <ShipmentStatusBadge status={s.status} label={s.status_display} />
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {s.shipper.name} · {s.shipping_method.name} · → {s.destination.label}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {s.orders.length} order(s) · {num(s.weight_kg)}kg / {num(s.cbm)}m³ · ETA {formatDate(s.eta)}
                </p>
              </div>
            </label>
          ))}
        </fieldset>
      )}
    </Modal>
  );
}
