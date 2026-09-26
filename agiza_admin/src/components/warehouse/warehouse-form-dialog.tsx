"use client";

import { useEffect, useMemo, useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { useCities, useCountries } from "@/components/shipping-engine/hooks";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import {
  warehouseApi,
  type WarehouseInput,
  type WarehouseLocation,
  type WarehouseStatus,
  type WarehouseType,
} from "@/lib/api/services/warehouse";

import { LOCATION_INVALIDATE } from "./shared";

interface FormState {
  name: string;
  type: WarehouseType;
  country: string;
  city: string;
  address: string;
  contact_person: string;
  phone: string;
  email: string;
  capacity_percent: string;
  status: WarehouseStatus;
  last_audit_at: string;
}

const EMPTY: FormState = {
  name: "",
  type: "consolidation",
  country: "",
  city: "",
  address: "",
  contact_person: "",
  phone: "",
  email: "",
  capacity_percent: "0",
  status: "active",
  last_audit_at: "",
};

const FIELDS = ["name", "type", "country", "city", "address", "contact_person", "phone", "email", "capacity_percent", "status", "last_audit_at"];

/** Add or edit a warehouse / pickup point / shop (the design's "Add New Warehouse / Location" modal). */
export function WarehouseFormDialog({
  open,
  warehouse,
  onClose,
}: {
  open: boolean;
  /** Edit this location; omit to add a new one. */
  warehouse?: WarehouseLocation | null;
  onClose: () => void;
}) {
  const editing = Boolean(warehouse);
  const countries = useCountries();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const cities = useCities(form.country ? Number(form.country) : undefined);

  const tanzania = useMemo(() => countries.data?.find((c) => c.iso2 === "TZ"), [countries.data]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLocal({});
    if (warehouse) {
      setForm({
        name: warehouse.name,
        type: warehouse.type,
        country: String(warehouse.country),
        city: String(warehouse.city),
        address: warehouse.address,
        contact_person: warehouse.contact_person,
        phone: warehouse.phone,
        email: warehouse.email,
        capacity_percent: String(warehouse.capacity_percent),
        status: warehouse.status,
        last_audit_at: warehouse.last_audit_at ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, warehouse]);

  // New locations default to Tanzania once the country list has loaded.
  useEffect(() => {
    if (open && !warehouse && tanzania) setForm((f) => (f.country ? f : { ...f, country: String(tanzania.id) }));
  }, [open, warehouse, tanzania]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useApiMutation(
    () => {
      const data: WarehouseInput = {
        name: form.name.trim(),
        type: form.type,
        city: Number(form.city),
        address: form.address.trim(),
        contact_person: form.contact_person.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        capacity_percent: Number(form.capacity_percent),
        status: form.status,
        last_audit_at: form.last_audit_at || null,
      };
      if (warehouse) return warehouseApi.update(warehouse.id, data);
      return warehouseApi.create({ ...data, country: Number(form.country) });
    },
    {
      invalidate: LOCATION_INVALIDATE,
      success: (w) => (editing ? `${w.code} updated` : `${w.name} added as ${w.code}`),
      onSuccess: onClose,
      onError: setError,
    },
  );

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Enter a name.";
    if (!form.country) errs.country = "Choose a country.";
    if (!form.city) errs.city = "Choose a city.";
    const cap = Number(form.capacity_percent);
    if (!Number.isInteger(cap) || cap < 0 || cap > 100) errs.capacity_percent = "Enter a whole number from 0 to 100.";
    setLocal(errs);
    if (Object.keys(errs).length) return;
    save.mutate(undefined);
  };

  const fe = mergedErrors(error, local);
  const cityOptions = cities.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${warehouse?.code}` : "Add New Warehouse / Location"}
      size="2xl"
      footer={
        <>
          <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {editing ? "Save Changes" : "Add Location"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Name" required htmlFor="wh-name" error={fe.name}>
            <Input id="wh-name" placeholder="e.g. Shanghai Consolidation Hub" value={form.name} onChange={(e) => set("name", e.target.value)} invalid={Boolean(fe.name)} />
          </Field>
        </div>
        <Field label="Type" required htmlFor="wh-type" error={fe.type}>
          <Select id="wh-type" value={form.type} onChange={(e) => set("type", e.target.value as WarehouseType)}>
            <option value="consolidation">Consolidation Hub</option>
            <option value="pickup_point">Pickup Point</option>
            <option value="fulfillment">Fulfillment Center</option>
            <option value="shop">Shop Location</option>
          </Select>
        </Field>
        <Field label="Country" required htmlFor="wh-country" error={fe.country} hint={editing ? "The country can't be changed after creation." : undefined}>
          <Select
            id="wh-country"
            value={form.country}
            disabled={editing || countries.isPending}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, city: "" }))}
          >
            <option value="">{countries.isPending ? "Loading countries…" : "Select a country"}</option>
            {countries.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name || c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" required htmlFor="wh-city" error={fe.city}>
          <Select id="wh-city" value={form.city} disabled={!form.country || cities.isPending} onChange={(e) => set("city", e.target.value)}>
            <option value="">{!form.country ? "Choose a country first" : cities.isPending ? "Loading cities…" : cityOptions.length ? "Select a city" : "No cities for this country"}</option>
            {cityOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.region_name && c.region_name !== c.name ? ` (${c.region_name})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact Person" htmlFor="wh-contact" error={fe.contact_person}>
          <Input id="wh-contact" placeholder="Name" value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Full Address" htmlFor="wh-address" error={fe.address}>
            <Textarea id="wh-address" rows={2} className="resize-none" placeholder="Street name, building, unit..." value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>
        <Field label="Phone" htmlFor="wh-phone" error={fe.phone}>
          <Input id="wh-phone" placeholder="+86 / +255..." value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="wh-email" error={fe.email}>
          <Input id="wh-email" type="email" placeholder="hub@agiza.co.tz" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={Boolean(fe.email)} />
        </Field>
        {editing && (
          <>
            <Field label="Status" htmlFor="wh-status" error={fe.status}>
              <Select id="wh-status" value={form.status} onChange={(e) => set("status", e.target.value as WarehouseStatus)}>
                <option value="active">Active</option>
                <option value="full">Full</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
            <Field label="Capacity used (%)" htmlFor="wh-capacity" error={fe.capacity_percent}>
              <Input
                id="wh-capacity"
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.capacity_percent}
                onChange={(e) => set("capacity_percent", e.target.value)}
                invalid={Boolean(fe.capacity_percent)}
              />
            </Field>
            <Field label="Last audit" htmlFor="wh-audit" error={fe.last_audit_at} hint="Locations not audited in 30 days count as pending audits.">
              <Input id="wh-audit" type="date" value={form.last_audit_at} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("last_audit_at", e.target.value)} />
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          <FormAlert error={error} shown={FIELDS} />
        </div>
      </div>
    </Modal>
  );
}
