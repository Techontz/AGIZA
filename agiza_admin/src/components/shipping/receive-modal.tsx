"use client";

import { PackageCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { shippingApi, type CargoType, type Parcel, type ReceiveInput, type WeightType } from "@/lib/api/services/shipping";

import {
  CARGO_TYPE_OPTIONS,
  FormErrorBox,
  placeholderOption,
  useCarriers,
  useConsolidationWarehouses,
  useFormErrors,
  useMethods,
  useShippingMutation,
  useTanzaniaCities,
} from "./shared";

const FIELDS = ["weight_kg", "cbm", "weight_type", "packages_quantity", "warehouse", "cargo_type", "shipper", "shipping_method", "destination_city", "note"];

/** Record the goods' arrival at the consolidation warehouse → Ready for Shipment. */
export function ReceiveModal({ parcel, onClose }: { parcel: Parcel; onClose: () => void }) {
  const [form, setForm] = useState({
    weight_kg: parcel.weight_kg ? String(Number(parcel.weight_kg)) : "",
    cbm: parcel.cbm ? String(Number(parcel.cbm)) : "",
    weight_type: "exact" as WeightType,
    packages_quantity: String(parcel.packages_quantity || 1),
    warehouse: parcel.warehouse ? String(parcel.warehouse.id) : "",
    cargo_type: parcel.cargo_type,
    shipper: parcel.shipper ? String(parcel.shipper.id) : "",
    shipping_method: parcel.shipping_method ? String(parcel.shipping_method.id) : "",
    destination_city: parcel.destination ? String(parcel.destination.id) : "",
    note: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const { errors, onError, reset } = useFormErrors();

  const carriers = useCarriers();
  const methods = useMethods();
  const cities = useTanzaniaCities();
  const warehouses = useConsolidationWarehouses();
  const active = (warehouses.data ?? []).filter((w) => w.status === "active");
  const sameOrigin = active.filter((w) => w.country_name === parcel.origin.name);
  const warehouseOptions = sameOrigin.length ? sameOrigin : active;

  const receive = useShippingMutation((data: ReceiveInput) => shippingApi.parcels.receive(parcel.id, data), {
    success: `${parcel.order.reference} received — ready for shipment`,
    onSuccess: onClose,
    onError,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    const data: ReceiveInput = {
      weight_kg: form.weight_kg,
      cbm: form.cbm === "" ? null : form.cbm,
      weight_type: form.weight_type,
      cargo_type: form.cargo_type,
      note: form.note.trim(),
    };
    if (form.packages_quantity) data.packages_quantity = Number(form.packages_quantity);
    if (form.warehouse) data.warehouse = Number(form.warehouse);
    if (form.shipper) data.shipper = Number(form.shipper);
    if (form.shipping_method) data.shipping_method = Number(form.shipping_method);
    if (form.destination_city) data.destination_city = Number(form.destination_city);
    receive.mutate(data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Receive Goods"
      size="2xl"
      footer={
        <>
          <Button type="submit" form="receive-form" variant="success" className="flex-1" loading={receive.isPending} disabled={!form.weight_kg || Number(form.weight_kg) <= 0}>
            <PackageCheck className="size-4" />
            Mark as Received
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="receive-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrorBox errors={errors} fields={FIELDS} />
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="font-semibold text-gray-900">
            {parcel.order.reference} · {parcel.item_name}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {parcel.origin.name} · {parcel.order.customer}
            {parcel.supplier_tracking_number && <> · Tracking {parcel.supplier_tracking_number}</>}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Weight (kg)" required htmlFor="rc-weight" error={errors.weight_kg}>
            <Input id="rc-weight" type="number" inputMode="decimal" min="0.001" step="0.001" value={form.weight_kg} onChange={(e) => set({ weight_kg: e.target.value })} invalid={Boolean(errors.weight_kg)} />
          </Field>
          <Field label="CBM (m³)" htmlFor="rc-cbm" error={errors.cbm}>
            <Input id="rc-cbm" type="number" inputMode="decimal" min="0" step="0.0001" value={form.cbm} onChange={(e) => set({ cbm: e.target.value })} invalid={Boolean(errors.cbm)} />
          </Field>
          <Field label="Weight Type" htmlFor="rc-wtype" error={errors.weight_type}>
            <Select id="rc-wtype" value={form.weight_type} onChange={(e) => set({ weight_type: e.target.value as WeightType })}>
              <option value="exact">Exact (weighed)</option>
              <option value="estimated">Estimated</option>
            </Select>
          </Field>
          <Field label="Packages Quantity" htmlFor="rc-pkg" error={errors.packages_quantity}>
            <Input id="rc-pkg" type="number" min="1" step="1" value={form.packages_quantity} onChange={(e) => set({ packages_quantity: e.target.value })} invalid={Boolean(errors.packages_quantity)} />
          </Field>
          <Field label="Warehouse" htmlFor="rc-wh" error={errors.warehouse}>
            <Select id="rc-wh" value={form.warehouse} onChange={(e) => set({ warehouse: e.target.value })}>
              <option value="">{placeholderOption(warehouses, "Not specified")}</option>
              {warehouseOptions.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </Select>
          </Field>
          <Field label="Cargo Type" htmlFor="rc-type" error={errors.cargo_type}>
            <Select id="rc-type" value={form.cargo_type} onChange={(e) => set({ cargo_type: e.target.value as CargoType })}>
              {CARGO_TYPE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Shipper" htmlFor="rc-shipper" error={errors.shipper}>
            <Select id="rc-shipper" value={form.shipper} onChange={(e) => set({ shipper: e.target.value })}>
              <option value="">{placeholderOption(carriers, "Not set")}</option>
              {carriers.data?.filter((c) => c.status === "active" || String(c.id) === form.shipper).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Shipping Method" htmlFor="rc-method" error={errors.shipping_method}>
            <Select id="rc-method" value={form.shipping_method} onChange={(e) => set({ shipping_method: e.target.value })}>
              <option value="">{placeholderOption(methods, "Not set")}</option>
              {methods.data?.filter((m) => m.status === "active" || String(m.id) === form.shipping_method).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Destination City" htmlFor="rc-dest" error={errors.destination_city}>
            <Select id="rc-dest" value={form.destination_city} onChange={(e) => set({ destination_city: e.target.value })}>
              <option value="">{placeholderOption(cities, "Not set")}</option>
              {cities.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Note" htmlFor="rc-note" error={errors.note}>
          <Textarea id="rc-note" rows={2} placeholder="Condition on arrival, packaging…" value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
