"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle, MapPin, Warehouse } from "lucide-react";
import { useState } from "react";

import { useCountries } from "@/components/shipping-engine/hooks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/states";
import { Modal } from "@/components/ui/modal";
import { errorText } from "@/lib/api/errors";
import {
  SHIPPER_SERVICES,
  peopleApi,
  peopleKeys,
  type ActiveStatus,
  type Shipper,
  type ShipperInput,
  type ShipperService,
} from "@/lib/api/services/people";
import { CARRIER_TYPES, seKeys } from "@/lib/api/services/shipping-engine";
import { cn } from "@/lib/cn";

import { FormErrors, ratingError, ratingPayload, serviceLabel, usePeopleMutation, type Errors } from "./shared";

const FIELDS = ["name", "type", "contact_email", "contact_phone", "status", "rating", "services", "origins", "warehouses", "notes"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const label = "block text-xs font-semibold text-gray-500 uppercase mb-1";
const input = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none";
const chip = "flex items-center gap-2 text-sm text-gray-700 cursor-pointer border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-400 transition-colors";

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export const shipperRef = (id: number) => `SHP-${String(id).padStart(3, "0")}`;

/** Design's ShipperEditModal (a Shipping Engine carrier); also adds a new shipper when `shipper` is null. */
export function ShipperEditModal({ shipper, onClose }: { shipper: Shipper | null; onClose: () => void }) {
  const [form, setForm] = useState({
    name: shipper?.name ?? "",
    type: shipper?.type ?? "international_air",
    contact_email: shipper?.contact_email ?? "",
    contact_phone: shipper?.contact_phone ?? "",
    status: shipper?.status ?? ("active" as ActiveStatus),
    rating: shipper?.rating != null ? String(Number(shipper.rating)) : "",
    services: shipper?.services ?? ([] as ShipperService[]),
    origins: shipper?.origins ?? ([] as number[]),
    warehouses: shipper?.warehouses ?? ([] as number[]),
    notes: shipper?.notes ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const countries = useCountries();
  const warehouses = useQuery({ queryKey: peopleKeys.warehouses, queryFn: peopleApi.consolidationWarehouses, staleTime: 5 * 60_000 });

  const save = usePeopleMutation(
    (body: ShipperInput) =>
      shipper ? peopleApi.shippers.update(shipper.id, body) : peopleApi.shippers.create(body),
    {
      success: (s) => (shipper ? `${s.name} updated` : `${s.name} added`),
      onSuccess: onClose,
      setErrors,
      invalidate: [seKeys.all],
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    const email = form.contact_email.trim();
    if (!form.name.trim()) local.name = "Enter the shipper's name.";
    if (email && !EMAIL_RE.test(email)) local.contact_email = "Enter a valid email address.";
    const re = ratingError(form.rating);
    if (re) local.rating = re;
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({
      ...form,
      name: form.name.trim(),
      contact_email: email,
      contact_phone: form.contact_phone.trim(),
      notes: form.notes.trim(),
      rating: ratingPayload(form.rating),
    });
  };

  const err = (k: string) => errors[k] && <p className="text-xs text-red-600 mt-1">{errors[k]}</p>;
  const linkedCount = form.warehouses.length;

  return (
    <Modal
      open
      onClose={onClose}
      title={
        shipper ? (
          <>
            <span className="block font-bold text-gray-900 text-lg">{shipper.name}</span>
            <span className="block text-xs font-normal text-gray-500">
              {shipperRef(shipper.id)}
              {shipper.contact_email && ` · ${shipper.contact_email}`}
            </span>
          </>
        ) : (
          <span className="text-lg">Add New Shipper</span>
        )
      }
      footer={
        <>
          <Button type="submit" form="shipper-form" className="flex-1 py-2.5 text-sm font-semibold" loading={save.isPending}>
            {shipper ? "Save Changes" : "Add Shipper"}
          </Button>
          <Button variant="secondary" className="px-5 py-2.5 text-sm" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="shipper-form" onSubmit={submit} className="space-y-5" noValidate>
        <FormErrors errors={errors} fields={FIELDS} />

        {/* Basic info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sh-name" className={label}>Company / Name</label>
            <input id="sh-name" value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(errors.name) || undefined} className={cn(input, errors.name && "border-red-400")} />
            {err("name")}
          </div>
          <div>
            <label htmlFor="sh-email" className={label}>Email</label>
            <input id="sh-email" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} aria-invalid={Boolean(errors.contact_email) || undefined} className={cn(input, errors.contact_email && "border-red-400")} />
            {err("contact_email")}
          </div>
          <div>
            <label htmlFor="sh-phone" className={label}>Phone</label>
            <input id="sh-phone" type="tel" value={form.contact_phone} maxLength={32} onChange={(e) => set("contact_phone", e.target.value)} className={input} />
            {err("contact_phone")}
          </div>
          <div>
            <label htmlFor="sh-status" className={label}>Status</label>
            <select id="sh-status" value={form.status} onChange={(e) => set("status", e.target.value as ActiveStatus)} className={input}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label htmlFor="sh-type" className={label}>Carrier Type</label>
            <select id="sh-type" value={form.type} onChange={(e) => set("type", e.target.value)} className={input}>
              {CARRIER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {err("type")}
          </div>
          <div>
            <label htmlFor="sh-rating" className={label}>Rating (0–5)</label>
            <input id="sh-rating" type="number" inputMode="decimal" min={0} max={5} step={0.1} value={form.rating} placeholder="Not rated" onChange={(e) => set("rating", e.target.value)} aria-invalid={Boolean(errors.rating) || undefined} className={cn(input, errors.rating && "border-red-400")} />
            {err("rating")}
          </div>
        </div>

        {/* Services */}
        <fieldset>
          <legend className="block text-xs font-semibold text-gray-500 uppercase mb-2">Shipping Services</legend>
          <div className="flex flex-wrap gap-2">
            {SHIPPER_SERVICES.map((s) => (
              <label key={s} className={chip}>
                <input type="checkbox" checked={form.services.includes(s)} onChange={() => set("services", toggle(form.services, s))} className="rounded text-blue-600" />
                {serviceLabel(s)}
              </label>
            ))}
          </div>
          {err("services")}
        </fieldset>

        {/* Countries */}
        <fieldset>
          <legend className="block text-xs font-semibold text-gray-500 uppercase mb-2">Origin Countries</legend>
          {countries.isPending ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 rounded-lg" />)}
            </div>
          ) : countries.isError ? (
            <p className="text-sm text-red-600">Couldn&apos;t load countries: {errorText(countries.error)}</p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {countries.data.map((c) => (
                <label key={c.id} className={chip}>
                  <input type="checkbox" checked={form.origins.includes(c.id)} onChange={() => set("origins", toggle(form.origins, c.id))} className="rounded text-blue-600" />
                  {c.name}
                </label>
              ))}
            </div>
          )}
          {err("origins")}
        </fieldset>

        {/* Consolidation Warehouses */}
        <fieldset>
          <legend className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700">
            <Warehouse className="size-4 text-gray-600" />
            Consolidation Warehouses
          </legend>
          <p className="text-xs text-gray-400 mb-3">
            Link this shipper to consolidation warehouses. When orders arrive at a linked warehouse, the shipper is automatically notified and the order tracking reflects the warehouse as a confirmed checkpoint.
          </p>
          {warehouses.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </div>
          ) : warehouses.isError ? (
            <div className="text-sm text-red-600">
              Couldn&apos;t load consolidation warehouses: {errorText(warehouses.error)}{" "}
              <button type="button" className="underline" onClick={() => warehouses.refetch()}>Retry</button>
            </div>
          ) : warehouses.data.length === 0 ? (
            <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-3">No consolidation warehouses yet. Add one under Warehouse &amp; Pick Up Points.</p>
          ) : (
            <div className="space-y-2">
              {warehouses.data.map((wh) => {
                const linked = form.warehouses.includes(wh.id);
                return (
                  <label
                    key={wh.id}
                    className={cn(
                      "flex items-center justify-between border rounded-xl px-4 py-3 cursor-pointer transition-colors",
                      linked ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked={linked} onChange={() => set("warehouses", toggle(form.warehouses, wh.id))} className="rounded text-blue-600" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{wh.name}</span>
                          <span className={cn("px-2 py-0.5 rounded text-xs font-medium", linked ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500")}>{wh.code}</span>
                          {wh.status !== "active" && <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">{wh.status}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3 text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-500 truncate">
                            {wh.city_name}, {wh.country_name}
                            {wh.address && ` — ${wh.address}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    {linked && <CheckCircle className="size-4 text-blue-600 flex-shrink-0" />}
                  </label>
                );
              })}
            </div>
          )}
          {linkedCount > 0 && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex items-center gap-2">
              <CheckCircle className="size-4 text-green-600 flex-shrink-0" />
              <p className="text-xs text-green-700">
                <strong>
                  {linkedCount} warehouse{linkedCount > 1 ? "s" : ""} linked.
                </strong>{" "}
                Orders received at these locations will show this shipper as the responsible party in tracking.
              </p>
            </div>
          )}
          {err("warehouses")}
        </fieldset>

        {/* Notes */}
        <div>
          <label htmlFor="sh-notes" className={label}>Internal Notes</label>
          <textarea id="sh-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Any notes about this shipper..." className={cn(input, "resize-none")} />
          {err("notes")}
        </div>
      </form>
    </Modal>
  );
}
