"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useCities, useCountries } from "@/components/shipping-engine/hooks";
import { ordersApi, type Customer, type EquipmentOrder } from "@/lib/api/services/orders";

import { CustomerPicker, errorText, useOrderMutation } from "../shared";

/** "New Support Request" (a no-op in the design). */
export function NewRequestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const countries = useCountries();
  const cities = useCities(countries.data?.find((c) => c.iso2 === "TZ")?.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCustomer(null);
      setV({ service_type: "installation", classification: "simple", priority: "medium" });
      setError(null);
    }
  }, [open]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const create = useOrderMutation(
    () =>
      ordersApi.equipment.create({
        customer: customer!.id,
        item_details: v.equipment,
        equipment: v.equipment,
        service_type: v.service_type,
        classification: v.classification,
        priority: v.priority,
        city: v.city ? Number(v.city) : null,
        site_address: v.site_address ?? "",
        expected_date: v.expected_date ? new Date(v.expected_date).toISOString() : null,
        ...(v.total_amount ? { total_amount: v.total_amount } : {}),
        notes: v.notes ?? "",
      }),
    {
      success: (o) => `Support request ${(o as EquipmentOrder).reference} created`,
      onSuccess: (o) => {
        onClose();
        onCreated((o as EquipmentOrder).id);
      },
      onError: (e) => setError(errorText(e)),
    },
  );
  const submit = () => {
    if (!customer) return setError("Choose or register the customer.");
    if (!v.equipment?.trim()) return setError("Describe the equipment.");
    create.mutate(undefined);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Support Request"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={create.isPending}>Create Request</Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" required><CustomerPicker value={customer} onChange={setCustomer} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Service type" required htmlFor="nr-svc">
            <Select id="nr-svc" value={v.service_type ?? ""} onChange={set("service_type")}>
              <option value="installation">Installation</option>
              <option value="product_setup">Product Setup</option>
              <option value="maintenance">Maintenance</option>
              <option value="electronic_repair">Electronic Repair</option>
            </Select>
          </Field>
          <Field label="Classification" htmlFor="nr-class">
            <Select id="nr-class" value={v.classification ?? ""} onChange={set("classification")}>
              <option value="simple">Simple</option>
              <option value="bulk">Bulk</option>
              <option value="machinery">Machinery</option>
              <option value="fragile">Fragile</option>
            </Select>
          </Field>
        </div>
        <Field label="Equipment" required htmlFor="nr-equip"><Input id="nr-equip" value={v.equipment ?? ""} onChange={set("equipment")} placeholder="e.g. AC Units x5 (Inverter)" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="City" htmlFor="nr-city">
            <Select id="nr-city" value={v.city ?? ""} onChange={set("city")}>
              <option value="">—</option>
              {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Site address" htmlFor="nr-site"><Input id="nr-site" value={v.site_address ?? ""} onChange={set("site_address")} /></Field>
          <Field label="Expected date" htmlFor="nr-date"><Input id="nr-date" type="datetime-local" value={v.expected_date ?? ""} onChange={set("expected_date")} /></Field>
          <Field label="Service value (TSh)" htmlFor="nr-value"><Input id="nr-value" type="number" min="0" value={v.total_amount ?? ""} onChange={set("total_amount")} /></Field>
          <Field label="Priority" htmlFor="nr-prio">
            <Select id="nr-prio" value={v.priority ?? "medium"} onChange={set("priority")}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </Field>
        </div>
        <Field label="Requirement description" htmlFor="nr-notes"><Textarea id="nr-notes" rows={3} value={v.notes ?? ""} onChange={set("notes")} /></Field>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
