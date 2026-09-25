"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { CARRIER_TYPES, engine, type Carrier } from "@/lib/api/services/shipping-engine";

import { applyFieldErrors, useCountries, useEngineMutation } from "./hooks";
import { Btn, EngineModal, FormField, Input, Select, Textarea } from "./ui";

const schema = z.object({
  name: z.string().trim().min(1, "Carrier name is required").max(120),
  type: z.string().min(1),
  contact_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  contact_phone: z.string().trim().max(32),
  origins: z.array(z.number()),
  destinations: z.array(z.number()),
  specializations: z.string(),
  notes: z.string(),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = {
  name: "", type: "international_air", contact_email: "", contact_phone: "", origins: [], destinations: [],
  specializations: "", notes: "", status: "active",
};

function CountryChecklist({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const countries = useCountries();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-gray-200 rounded-lg p-3">
      {(countries.data ?? []).map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-blue-600"
            checked={value.includes(c.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))}
          />
          {c.name}
        </label>
      ))}
    </div>
  );
}

/** Add / edit a carrier (design: CreateCarrierForm). */
export function CarrierForm({ open, onClose, carrier }: { open: boolean; onClose: () => void; carrier?: Carrier | null }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    form.reset(
      carrier
        ? {
            name: carrier.name, type: carrier.type, contact_email: carrier.contact_email, contact_phone: carrier.contact_phone,
            origins: carrier.origins, destinations: carrier.destinations, specializations: carrier.specializations.join(", "),
            notes: carrier.notes, status: carrier.status,
          }
        : EMPTY,
    );
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, carrier?.id]);

  const mutation = useEngineMutation(
    (payload: Record<string, unknown>) => (carrier ? engine.carriers.update(carrier.id, payload) : engine.carriers.create(payload)),
    { success: carrier ? "Carrier updated" : "Carrier added", onSuccess: onClose },
  );
  const submit = form.handleSubmit((v) =>
    mutation.mutate(
      { ...v, specializations: v.specializations.split(",").map((s) => s.trim()).filter(Boolean) },
      { onError: (err) => setFormError(applyFieldErrors(err, form.setError, Object.keys(EMPTY))) },
    ),
  );
  const { errors } = form.formState;

  return (
    <EngineModal
      open={open}
      onClose={onClose}
      title={carrier ? `Edit Carrier — ${carrier.name}` : "Add Carrier"}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={submit} loading={mutation.isPending}>
            {carrier ? "Save Carrier" : "Add Carrier"}
          </Btn>
        </>
      }
    >
      {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <FormField label="Carrier Name" required error={errors.name?.message} htmlFor="carrier-name">
        <Input id="carrier-name" placeholder="e.g. SF Express" invalid={!!errors.name} {...form.register("name")} />
      </FormField>
      <FormField label="Carrier Type" required>
        <Select {...form.register("type")}>
          {CARRIER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Contact Email" error={errors.contact_email?.message}>
          <Input type="email" placeholder="contact@carrier.com" {...form.register("contact_email")} />
        </FormField>
        <FormField label="Contact Phone" error={errors.contact_phone?.message}>
          <Input placeholder="+255..." {...form.register("contact_phone")} />
        </FormField>
      </div>
      <FormField label="Supported Origins" hint="Which countries this carrier ships from">
        <Controller control={form.control} name="origins" render={({ field }) => <CountryChecklist value={field.value} onChange={field.onChange} />} />
      </FormField>
      <FormField label="Supported Destinations" hint="Which countries this carrier ships to">
        <Controller control={form.control} name="destinations" render={({ field }) => <CountryChecklist value={field.value} onChange={field.onChange} />} />
      </FormField>
      <FormField label="Specializations" hint="Separate with commas">
        <Textarea rows={2} placeholder="e.g. Electronics, Restricted goods, Oversized..." {...form.register("specializations")} />
      </FormField>
      <FormField label="Notes">
        <Textarea rows={2} placeholder="Any additional notes about this carrier..." {...form.register("notes")} />
      </FormField>
      <FormField label="Status" required>
        <Select {...form.register("status")}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </FormField>
    </EngineModal>
  );
}
