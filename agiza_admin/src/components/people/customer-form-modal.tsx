"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import {
  CHANNEL_OPTIONS,
  peopleApi,
  type ActiveStatus,
  type Customer,
  type CustomerInput,
  type PreferredChannel,
} from "@/lib/api/services/people";

import { FormErrors, usePeopleMutation, type Errors } from "./shared";

const FIELDS = ["full_name", "phone", "email", "company_name", "preferred_channel", "notes", "status"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Add a customer, or edit one when `customer` is given. */
export function CustomerFormModal({ customer, onClose }: { customer?: Customer | null; onClose: () => void }) {
  const [form, setForm] = useState<CustomerInput & { status: ActiveStatus }>({
    full_name: customer?.full_name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    company_name: customer?.company_name ?? "",
    preferred_channel: customer?.preferred_channel ?? "",
    notes: customer?.notes ?? "",
    status: customer?.status ?? "active",
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = usePeopleMutation(
    (body: CustomerInput) => (customer ? peopleApi.customers.update(customer.id, body) : peopleApi.customers.create(body)),
    {
      success: (c) => (customer ? `${c.full_name} updated` : `${c.full_name} added (${c.reference})`),
      onSuccess: onClose,
      setErrors,
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      ...form,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      company_name: form.company_name.trim(),
      notes: form.notes.trim(),
    };
    const local: Errors = {};
    if (!body.full_name) local.full_name = "Enter the customer's name.";
    if (body.email && !EMAIL_RE.test(body.email)) local.email = "Enter a valid email address.";
    if (!body.email && !body.phone) local.phone = "Provide at least a phone number or an email address.";
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate(body);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? "Edit Customer" : "Add New Customer"}
      footer={
        <>
          <Button type="submit" form="customer-form" size="lg" className="flex-1" loading={save.isPending}>
            {customer ? "Save Changes" : "Add Customer"}
          </Button>
          <Button variant="muted" size="lg" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrors errors={errors} fields={FIELDS} />
        <Field label="Full Name" required htmlFor="c-name" error={errors.full_name}>
          <Input id="c-name" value={form.full_name} maxLength={150} autoFocus onChange={(e) => set("full_name", e.target.value)} invalid={Boolean(errors.full_name)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone" htmlFor="c-phone" error={errors.phone} hint="Phone or email is required">
            <Input id="c-phone" type="tel" value={form.phone} maxLength={32} placeholder="+255 7XX XXX XXX" onChange={(e) => set("phone", e.target.value)} invalid={Boolean(errors.phone)} />
          </Field>
          <Field label="Email" htmlFor="c-email" error={errors.email}>
            <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={Boolean(errors.email)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Company" htmlFor="c-company" error={errors.company_name}>
            <Input id="c-company" value={form.company_name} maxLength={150} onChange={(e) => set("company_name", e.target.value)} />
          </Field>
          <Field label="Preferred Channel" htmlFor="c-channel" error={errors.preferred_channel}>
            <Select id="c-channel" value={form.preferred_channel} onChange={(e) => set("preferred_channel", e.target.value as PreferredChannel)}>
              <option value="">Not specified</option>
              {CHANNEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {customer && (
          <Field label="Status" htmlFor="c-status" error={errors.status}>
            <Select id="c-status" value={form.status} onChange={(e) => set("status", e.target.value as ActiveStatus)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        )}
        <Field label="Notes" htmlFor="c-notes" error={errors.notes}>
          <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any notes about this customer..." />
        </Field>
      </form>
    </Modal>
  );
}
