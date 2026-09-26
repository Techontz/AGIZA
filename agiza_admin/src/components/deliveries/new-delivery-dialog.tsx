"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useCities, useCountries } from "@/components/shipping-engine/hooks";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { deliveriesApi, deliveryKeys, type Delivery, type DeliveryType } from "@/lib/api/services/deliveries";
import { orderKeys } from "@/lib/api/services/orders";

import { FormAlert, fromLocalInput, mergedErrors } from "./form-helpers";
import { OrderPicker, type PickedOrder } from "./order-picker";

type Values = {
  delivery_address: string;
  destination_city: string;
  destination_area: string;
  delivery_type: DeliveryType;
  pickup_point: string;
  scheduled_at: string;
  recipient_name: string;
  recipient_phone: string;
  driver: string;
  notes: string;
};
const EMPTY: Values = {
  delivery_address: "",
  destination_city: "",
  destination_area: "",
  delivery_type: "standard",
  pickup_point: "",
  scheduled_at: "",
  recipient_name: "",
  recipient_phone: "",
  driver: "",
  notes: "",
};
const SHOWN = ["order", ...Object.keys(EMPTY)];

/** "New Delivery": last-mile delivery for an international or equipment order. */
export function NewDeliveryDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (d: Delivery) => void }) {
  const countries = useCountries();
  const cities = useCities(countries.data?.find((c) => c.iso2 === "TZ")?.id);
  const drivers = useQuery({ queryKey: deliveryKeys.drivers, queryFn: deliveriesApi.drivers, enabled: open, staleTime: 60_000 });
  const [order, setOrder] = useState<PickedOrder | null>(null);
  const [v, setV] = useState<Values>(EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setOrder(null);
      setV(EMPTY);
      setError(null);
      setLocal({});
    }
  }, [open]);

  const pick = (o: PickedOrder | null) => {
    setOrder(o);
    if (o) {
      setV((p) => ({
        ...p,
        delivery_address: p.delivery_address || o.address,
        destination_city: p.destination_city || (o.city ? String(o.city.id) : ""),
        recipient_name: p.recipient_name || o.customer.full_name,
        recipient_phone: p.recipient_phone || o.customer.phone,
      }));
    }
  };
  const set = <K extends keyof Values>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  const create = useApiMutation(
    () =>
      deliveriesApi.create({
        order: order!.id,
        delivery_address: v.delivery_address.trim(),
        delivery_type: v.delivery_type,
        destination_city: v.destination_city ? Number(v.destination_city) : null,
        destination_area: v.destination_area.trim(),
        pickup_point: v.pickup_point.trim(),
        scheduled_at: fromLocalInput(v.scheduled_at),
        recipient_name: v.recipient_name.trim(),
        recipient_phone: v.recipient_phone.trim(),
        notes: v.notes,
        driver: v.driver ? Number(v.driver) : null,
      }),
    {
      invalidate: [deliveryKeys.all, orderKeys.all],
      success: (d) => `Delivery ${d.reference} created for ${d.order.reference}`,
      onSuccess: (d) => {
        onClose();
        onCreated(d);
      },
      onError: setError,
    },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!order) errs.order = "Choose the order to deliver.";
    if (!v.delivery_address.trim()) errs.delivery_address = "Enter the delivery address.";
    setLocal(errs);
    if (Object.keys(errs).length === 0) create.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Delivery"
      size="3xl"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={create.isPending}>
            Create Delivery
          </Button>
          <Button variant="muted" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Order" required htmlFor="nd-order" hint="International and equipment orders. Express orders get their delivery when a driver is assigned in Express Delivery.">
          <OrderPicker id="nd-order" value={order} onChange={pick} kinds={["international", "equipment"]} error={fe.order} />
        </Field>
        <Field label="Delivery address" required htmlFor="nd-address" error={fe.delivery_address}>
          <Input id="nd-address" value={v.delivery_address} onChange={set("delivery_address")} invalid={Boolean(fe.delivery_address)} placeholder="e.g. House #45, Mikocheni Beach Road" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="City" htmlFor="nd-city" error={fe.destination_city}>
            <Select id="nd-city" value={v.destination_city} onChange={set("destination_city")}>
              <option value="">{cities.isPending ? "Loading…" : "Select city"}</option>
              {cities.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area" htmlFor="nd-area" error={fe.destination_area}>
            <Input id="nd-area" value={v.destination_area} onChange={set("destination_area")} placeholder="e.g. Mikocheni" />
          </Field>
          <Field label="Delivery type" required htmlFor="nd-type" error={fe.delivery_type}>
            <Select id="nd-type" value={v.delivery_type} onChange={set("delivery_type")}>
              <option value="standard">Standard</option>
              <option value="express">Express</option>
              <option value="same_day">Same Day</option>
              <option value="inter_city">Inter-City</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Pickup point" htmlFor="nd-pickup" error={fe.pickup_point}>
            <Input id="nd-pickup" value={v.pickup_point} onChange={set("pickup_point")} placeholder="e.g. Agiza Warehouse - Kariakoo" />
          </Field>
          <Field label="Scheduled date & time" htmlFor="nd-sched" error={fe.scheduled_at}>
            <Input id="nd-sched" type="datetime-local" value={v.scheduled_at} onChange={set("scheduled_at")} />
          </Field>
          <Field label="Recipient name" htmlFor="nd-rname" error={fe.recipient_name}>
            <Input id="nd-rname" value={v.recipient_name} onChange={set("recipient_name")} />
          </Field>
          <Field label="Recipient phone" htmlFor="nd-rphone" error={fe.recipient_phone}>
            <Input id="nd-rphone" type="tel" value={v.recipient_phone} onChange={set("recipient_phone")} />
          </Field>
        </div>
        <Field label="Driver (optional)" htmlFor="nd-driver" error={fe.driver} hint="Assigning a driver now moves the delivery to Assigned Driver.">
          <Select id="nd-driver" value={v.driver} onChange={set("driver")}>
            <option value="">Assign later</option>
            {drivers.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="nd-notes" error={fe.notes}>
          <Textarea id="nd-notes" rows={2} value={v.notes} onChange={set("notes")} />
        </Field>
        <FormAlert error={error} shown={SHOWN} />
      </div>
    </Modal>
  );
}
