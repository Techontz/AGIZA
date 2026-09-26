"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { shippingApi, type Parcel, type Shipment } from "@/lib/api/services/shipping";

import {
  FormErrorBox,
  isoToday,
  num,
  placeholderOption,
  useCarriers,
  useConsolidationWarehouses,
  useFormErrors,
  useMethods,
  useShippingMutation,
  useTanzaniaCities,
} from "./shared";

/** The value every parcel shares, or "" when they differ / are unset. */
function common(parcels: Parcel[], pick: (p: Parcel) => number | undefined): string {
  const values = new Set(parcels.map(pick));
  const [only] = [...values];
  return values.size === 1 && only !== undefined ? String(only) : "";
}

const FIELDS = ["shipper", "shipping_method", "destination_city", "origin_warehouse", "eta", "master_tracking_number", "shipment_number", "notes"];

export function CreateShipmentModal({
  parcels,
  onClose,
  onCreated,
}: {
  parcels: Parcel[];
  onClose: () => void;
  onCreated: (s: Shipment) => void;
}) {
  const [form, setForm] = useState(() => ({
    shipper: common(parcels, (p) => p.shipper?.id),
    shipping_method: common(parcels, (p) => p.shipping_method?.id),
    destination_city: common(parcels, (p) => p.destination?.id),
    origin_warehouse: common(parcels, (p) => p.warehouse?.id),
    eta: "",
    master_tracking_number: "",
    shipment_number: "",
    notes: "",
  }));
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const { errors, onError, reset } = useFormErrors();

  const carriers = useCarriers();
  const methods = useMethods();
  const cities = useTanzaniaCities();
  const warehouses = useConsolidationWarehouses();

  const origins = [...new Set(parcels.map((p) => p.origin.iso2))];
  const origin = parcels[0]?.origin;
  const mixedOrigins = origins.length > 1;
  const all = warehouses.data ?? [];
  const sameOrigin = all.filter((w) => origin && w.country_name === origin.name);
  const originWarehouses = sameOrigin.length ? sameOrigin : all;
  const totalKg = parcels.reduce((sum, p) => sum + Number(p.weight_kg ?? 0), 0);
  const totalCbm = parcels.reduce((sum, p) => sum + Number(p.cbm ?? 0), 0);

  const create = useShippingMutation(shippingApi.shipments.create, {
    success: (s) => `Shipment ${s.cargo_id} created`,
    onSuccess: onCreated,
    onError,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    create.mutate({
      parcels: parcels.map((p) => p.id),
      shipper: Number(form.shipper),
      shipping_method: Number(form.shipping_method),
      destination_city: Number(form.destination_city),
      origin_warehouse: form.origin_warehouse ? Number(form.origin_warehouse) : null,
      eta: form.eta || null,
      master_tracking_number: form.master_tracking_number.trim(),
      shipment_number: form.shipment_number.trim(),
      notes: form.notes.trim(),
    });
  };

  const valid = form.shipper && form.shipping_method && form.destination_city && !mixedOrigins;

  return (
    <Modal
      open
      onClose={onClose}
      title="Create New Shipment"
      size="2xl"
      footer={
        <>
          <Button type="submit" form="create-shipment-form" className="flex-1" loading={create.isPending} disabled={!valid}>
            <Plus className="size-4" />
            Create Shipment
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="create-shipment-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrorBox errors={errors} fields={FIELDS} />

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-900 font-medium">
            {parcels.length} order(s) · {num(String(totalKg))}kg / {num(String(totalCbm))}m³
          </p>
          <p className="text-sm text-blue-800 mt-1 break-words">
            {parcels.map((p) => p.order.reference).join(", ")}
          </p>
          {origin && !mixedOrigins && <p className="text-xs text-blue-700 mt-1">Origin: {origin.name}</p>}
        </div>

        {mixedOrigins && (
          <div role="alert" className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
            A shipment can only consolidate orders from one origin. Selected origins: {origins.join(", ")}.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Shipper" required htmlFor="cs-shipper" error={errors.shipper}>
            <Select id="cs-shipper" value={form.shipper} onChange={(e) => set({ shipper: e.target.value })}>
              <option value="">{placeholderOption(carriers, "Select shipper")}</option>
              {carriers.data?.filter((c) => c.status === "active").map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Shipping Method" required htmlFor="cs-method" error={errors.shipping_method}>
            <Select id="cs-method" value={form.shipping_method} onChange={(e) => set({ shipping_method: e.target.value })}>
              <option value="">{placeholderOption(methods, "Select method")}</option>
              {methods.data?.filter((m) => m.status === "active").map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Destination City" required htmlFor="cs-dest" error={errors.destination_city}>
            <Select id="cs-dest" value={form.destination_city} onChange={(e) => set({ destination_city: e.target.value })}>
              <option value="">{placeholderOption(cities, "Select city (Tanzania)")}</option>
              {cities.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Origin Warehouse" htmlFor="cs-wh" error={errors.origin_warehouse}>
            <Select id="cs-wh" value={form.origin_warehouse} onChange={(e) => set({ origin_warehouse: e.target.value })}>
              <option value="">{placeholderOption(warehouses, "Not specified")}</option>
              {originWarehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code}){w.city_name ? ` · ${w.city_name}` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="ETA" htmlFor="cs-eta" error={errors.eta}>
            <Input id="cs-eta" type="date" min={isoToday()} value={form.eta} onChange={(e) => set({ eta: e.target.value })} invalid={Boolean(errors.eta)} />
          </Field>
          <Field label="Master Tracking #" htmlFor="cs-mtn" hint="Bill of lading / air waybill (optional)" error={errors.master_tracking_number}>
            <Input id="cs-mtn" maxLength={80} value={form.master_tracking_number} onChange={(e) => set({ master_tracking_number: e.target.value })} invalid={Boolean(errors.master_tracking_number)} />
          </Field>
          <Field label="Shipment Number" htmlFor="cs-num" hint="Leave blank to generate one" error={errors.shipment_number}>
            <Input id="cs-num" maxLength={40} value={form.shipment_number} onChange={(e) => set({ shipment_number: e.target.value })} invalid={Boolean(errors.shipment_number)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="cs-notes" error={errors.notes}>
          <Textarea id="cs-notes" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
