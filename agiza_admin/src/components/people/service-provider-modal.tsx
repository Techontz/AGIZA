"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { useCities } from "@/components/shipping-engine/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import {
  peopleApi,
  type ActiveStatus,
  type ServiceProvider,
  type ServiceProviderInput,
} from "@/lib/api/services/people";

import { FormErrors, ratingError, ratingPayload, usePeopleAccess, usePeopleMutation, type Errors } from "./shared";

const FIELDS = ["name", "email", "phone", "services", "city", "address", "status", "rating", "notes"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Add / edit an external service provider (installers, plumbers, cleaners...). */
export function ServiceProviderModal({ provider, onClose }: { provider: ServiceProvider | null; onClose: () => void }) {
  const access = usePeopleAccess();
  const cities = useCities();
  const [form, setForm] = useState({
    name: provider?.name ?? "",
    email: provider?.email ?? "",
    phone: provider?.phone ?? "",
    services: provider?.services ?? "",
    city: provider?.city ?? null,
    address: provider?.address ?? "",
    status: provider?.status ?? ("active" as ActiveStatus),
    rating: provider?.rating != null ? String(Number(provider.rating)) : "",
    notes: provider?.notes ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = usePeopleMutation(
    (body: ServiceProviderInput) =>
      provider ? peopleApi.serviceProviders.update(provider.id, body) : peopleApi.serviceProviders.create(body),
    {
      success: (p) => (provider ? `${p.name} updated` : `${p.name} added (${p.reference})`),
      onSuccess: onClose,
      setErrors,
    },
  );
  const remove = usePeopleMutation(() => peopleApi.serviceProviders.remove(provider!.id), {
    success: `${provider?.name ?? "Service provider"} deleted`,
    onSuccess: () => {
      setConfirmDelete(false);
      onClose();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    const email = form.email.trim();
    if (!form.name.trim()) local.name = "Enter the provider's name.";
    if (email && !EMAIL_RE.test(email)) local.email = "Enter a valid email address.";
    const re = ratingError(form.rating);
    if (re) local.rating = re;
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({
      ...form,
      name: form.name.trim(),
      email,
      phone: form.phone.trim(),
      services: form.services.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      rating: ratingPayload(form.rating),
    });
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={provider ? "Edit Service Provider" : "Add New Service Provider"}
        footer={
          <>
            <Button type="submit" form="provider-form" size="lg" className="flex-1" loading={save.isPending}>
              {provider ? "Save Changes" : "Add Service Provider"}
            </Button>
            {provider && access.providersDelete && (
              <Button variant="outline" size="lg" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmDelete(true)} aria-label="Delete service provider">
                <Trash2 className="size-4" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            )}
            <Button variant="muted" size="lg" onClick={onClose}>
              Cancel
            </Button>
          </>
        }
      >
        <form id="provider-form" onSubmit={submit} className="space-y-4" noValidate>
          {provider && <p className="text-sm text-gray-500">{provider.reference} · {provider.total_orders} jobs</p>}
          <FormErrors errors={errors} fields={FIELDS} />
          <Field label="Name" required htmlFor="sp-name" error={errors.name}>
            <Input id="sp-name" value={form.name} maxLength={150} onChange={(e) => set("name", e.target.value)} invalid={Boolean(errors.name)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email" htmlFor="sp-email" error={errors.email}>
              <Input id="sp-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={Boolean(errors.email)} />
            </Field>
            <Field label="Phone" htmlFor="sp-phone" error={errors.phone}>
              <Input id="sp-phone" type="tel" value={form.phone} maxLength={32} onChange={(e) => set("phone", e.target.value)} invalid={Boolean(errors.phone)} />
            </Field>
          </div>
          <Field label="Services" htmlFor="sp-services" error={errors.services} hint="Comma-separated, e.g. Plumbing, Installation, Cleaning">
            <Input id="sp-services" value={form.services} maxLength={255} onChange={(e) => set("services", e.target.value)} invalid={Boolean(errors.services)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="City" htmlFor="sp-city" error={errors.city}>
              <Select id="sp-city" value={form.city ?? ""} disabled={cities.isPending} onChange={(e) => set("city", e.target.value ? Number(e.target.value) : null)}>
                <option value="">{cities.isPending ? "Loading cities…" : cities.isError ? "Couldn't load cities" : "Select city"}</option>
                {cities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.region_name ? ` (${c.region_name})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Address" htmlFor="sp-address" error={errors.address}>
              <Input id="sp-address" value={form.address} maxLength={255} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Status" htmlFor="sp-status" error={errors.status}>
              <Select id="sp-status" value={form.status} onChange={(e) => set("status", e.target.value as ActiveStatus)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
            <Field label="Rating (0–5)" htmlFor="sp-rating" error={errors.rating}>
              <Input id="sp-rating" type="number" inputMode="decimal" min={0} max={5} step={0.1} placeholder="Not rated" value={form.rating} onChange={(e) => set("rating", e.target.value)} invalid={Boolean(errors.rating)} />
            </Field>
          </div>
          <Field label="Notes" htmlFor="sp-notes" error={errors.notes}>
            <Textarea id="sp-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any notes about this provider..." />
          </Field>
        </form>
      </Modal>

      {provider && (
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${provider.name}?`}
          message={
            provider.total_orders > 0
              ? `This provider has ${provider.total_orders} job${provider.total_orders === 1 ? "" : "s"} on record; deleting unlinks them from those orders. Consider setting the provider Inactive instead.`
              : "This permanently removes the service provider."
          }
          confirmLabel="Delete"
          tone="danger"
          pending={remove.isPending}
          onConfirm={() => remove.mutate(undefined)}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
