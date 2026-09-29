"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import {
  catalogApi,
  type CommissionMode,
  type ProfitAgreementInput,
  type ProfitScope,
  type ProfitType,
  type Vendor,
  type VendorInput,
} from "@/lib/api/services/catalog";
import { cn } from "@/lib/cn";
import { formatTSh } from "@/lib/format";

import { FormErrors, IconSwitch, useCatalogMutation, type Errors } from "./shared";

const EXAMPLE_PRICE = 100_000;

function localProfitError(p: Pick<VendorInput, "profit_type" | "profit_value">): string | null {
  if (p.profit_value.trim() === "") return "Enter the profit value.";
  const n = Number(p.profit_value);
  if (!Number.isFinite(n) || n < 0) return "Enter a positive number.";
  if (p.profit_type === "percent" && n > 100) return "A percentage can't exceed 100.";
  return null;
}

/** The design's "Example Calculation" box, computed from the form's values. */
function ExampleCalculation({ type, value }: { type: ProfitType; value: string }) {
  const n = Number(value) || 0;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <p className="text-sm font-semibold text-blue-900 mb-2">Example Calculation</p>
      <div className="text-sm text-blue-800">
        {type === "fixed" ? (
          <p>
            For a product sold at {formatTSh(EXAMPLE_PRICE)}, your profit will be <span className="font-semibold">{formatTSh(n)}</span> (fixed amount per sale)
          </p>
        ) : (
          <p>
            For a product sold at {formatTSh(EXAMPLE_PRICE)}, your profit will be{" "}
            <span className="font-semibold">{formatTSh(Math.round((EXAMPLE_PRICE * n) / 100 * 100) / 100)}</span> ({n}% of sale price)
          </p>
        )}
      </div>
    </div>
  );
}

function ProfitValueInput({ id, type, value, onChange, error }: { id: string; type: ProfitType; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={type === "percent" ? 100 : undefined}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error) || undefined}
        className={cn(inputClass, "pr-12", error && "border-red-400 focus:ring-red-500")}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">{type === "fixed" ? "TSh" : "%"}</span>
    </div>
  );
}

const VENDOR_FIELDS = ["name", "email", "phone", "location", "status", "verified", "profit_type", "profit_value", "profit_scope", "joined_date", "notes"] as const;

export function VendorModal({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const [form, setForm] = useState<VendorInput>({
    name: vendor?.name ?? "",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    location: vendor?.location ?? "",
    status: vendor?.status ?? "active",
    verified: vendor?.verified ?? false,
    profit_type: vendor?.profit_type ?? "percent",
    profit_value: vendor ? String(Number(vendor.profit_value)) : "",
    profit_scope: vendor?.profit_scope ?? "all",
    joined_date: vendor?.joined_date ?? null,
    notes: vendor?.notes ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof VendorInput>(k: K, v: VendorInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useCatalogMutation((body: VendorInput) => (vendor ? catalogApi.vendors.update(vendor.id, body) : catalogApi.vendors.create(body)), {
    success: (v) => (vendor ? `${v.name} updated` : `${v.name} added`),
    onSuccess: onClose,
    setErrors,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!form.name.trim()) local.name = "Enter the vendor name.";
    const pe = localProfitError(form);
    if (pe) local.profit_value = pe;
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({ ...form, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), location: form.location.trim() });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={vendor ? "Edit Vendor" : "Add New Vendor"}
      size="3xl"
      footer={
        <>
          <Button type="submit" form="vendor-form" size="lg" className="flex-1" loading={save.isPending}>
            {vendor ? "Update Vendor" : "Add Vendor"}
          </Button>
          <Button variant="muted" size="lg" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <form id="vendor-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrors errors={errors} fields={VENDOR_FIELDS} />
        <Field label="Vendor Name" required htmlFor="v-name" error={errors.name}>
          <Input id="v-name" value={form.name} maxLength={150} onChange={(e) => set("name", e.target.value)} invalid={Boolean(errors.name)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Email" htmlFor="v-email" error={errors.email}>
            <Input id="v-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={Boolean(errors.email)} />
          </Field>
          <Field label="Phone" htmlFor="v-phone" error={errors.phone}>
            <Input id="v-phone" type="tel" value={form.phone} maxLength={32} onChange={(e) => set("phone", e.target.value)} invalid={Boolean(errors.phone)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Location" htmlFor="v-location" error={errors.location}>
            <Input id="v-location" value={form.location} maxLength={120} placeholder="e.g. Dar es Salaam" onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="v-status" error={errors.status}>
            <Select id="v-status" value={form.status} onChange={(e) => set("status", e.target.value as VendorInput["status"])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Profit Type" htmlFor="v-ptype" error={errors.profit_type}>
            <Select id="v-ptype" value={form.profit_type} onChange={(e) => set("profit_type", e.target.value as ProfitType)}>
              <option value="fixed">Fixed Amount (TSh)</option>
              <option value="percent">Percentage (%)</option>
            </Select>
          </Field>
          <Field label="Profit Value" required htmlFor="v-pvalue" error={errors.profit_value}>
            <ProfitValueInput id="v-pvalue" type={form.profit_type} value={form.profit_value} onChange={(v) => set("profit_value", v)} error={errors.profit_value} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Profit Scope" htmlFor="v-pscope" error={errors.profit_scope}>
            <Select id="v-pscope" value={form.profit_scope} onChange={(e) => set("profit_scope", e.target.value as ProfitScope)}>
              <option value="all">Apply to All Products</option>
              <option value="per_product">Configure Per Product</option>
            </Select>
          </Field>
          <Field label="Joined Date" htmlFor="v-joined" error={errors.joined_date}>
            <Input id="v-joined" type="date" value={form.joined_date ?? ""} onChange={(e) => set("joined_date", e.target.value || null)} />
          </Field>
        </div>
        {vendor && (
          <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
            <div>
              <p className="text-xs text-gray-500">Products</p>
              <p className="font-semibold text-gray-900">{vendor.products_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Sales</p>
              <p className="font-semibold text-gray-900">{formatTSh(vendor.total_sales)}</p>
            </div>
            <p className="col-span-2 text-xs text-gray-500">Calculated from the vendor&apos;s products and orders.</p>
          </div>
        )}
        <Field label="Notes" htmlFor="v-notes" error={errors.notes}>
          <Textarea id="v-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <div className="flex items-center justify-between py-2 border-t border-gray-200">
          <div>
            <p className="font-semibold text-gray-900">Verified Vendor</p>
            <p className="text-sm text-gray-600">The vendor&apos;s identity and business details have been checked</p>
          </div>
          <IconSwitch size="lg" checked={form.verified} onChange={(v) => set("verified", v)} label="Verified vendor" />
        </div>
      </form>
    </Modal>
  );
}

const PROFIT_FIELDS = ["commission_mode", "profit_type", "profit_value", "profit_scope"] as const;

const COMMISSION_MODES: { value: CommissionMode; title: string; description: string }[] = [
  { value: "default", title: "Marketplace rates", description: "AGIZA's category commission, or the marketplace default rate" },
  { value: "custom", title: "This vendor's own agreement", description: "A fixed amount or percentage agreed with this vendor" },
];

export function ProfitAgreementModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const [form, setForm] = useState<ProfitAgreementInput>({
    commission_mode: vendor.commission_mode ?? "custom",
    profit_type: vendor.profit_type,
    profit_value: String(Number(vendor.profit_value)),
    profit_scope: vendor.profit_scope,
  });
  const [errors, setErrors] = useState<Errors>({});
  const save = useCatalogMutation((body: Partial<ProfitAgreementInput>) => catalogApi.vendors.update(vendor.id, body), {
    success: (v) => `Profit agreement for ${v.name} updated`,
    onSuccess: onClose,
    setErrors,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.commission_mode === "default") {
      setErrors({});
      return save.mutate({ commission_mode: "default" });
    }
    const pe = localProfitError(form);
    if (pe) return setErrors({ profit_value: pe });
    setErrors({});
    save.mutate(form);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="block">
          Edit Profit Agreement
          <span className="block text-sm font-normal text-gray-600 mt-1">Configure profit settings for {vendor.name}</span>
        </span>
      }
      size="2xl"
      footer={
        <>
          <Button type="submit" form="profit-form" size="lg" className="flex-1" loading={save.isPending}>
            Update Profit Agreement
          </Button>
          <Button variant="muted" size="lg" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <form id="profit-form" onSubmit={submit} className="space-y-6" noValidate>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Vendor</p>
              <p className="font-semibold text-gray-900">{vendor.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Location</p>
              <p className="font-semibold text-gray-900">{vendor.location || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Products</p>
              <p className="font-semibold text-gray-900">{vendor.products_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Sales</p>
              <p className="font-semibold text-gray-900">{formatTSh(vendor.total_sales)}</p>
            </div>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-gray-900 mb-3">Commission</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMMISSION_MODES.map((m) => (
              <label
                key={m.value}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                  form.commission_mode === m.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50",
                )}
              >
                <input
                  type="radio"
                  name="commission_mode"
                  value={m.value}
                  checked={form.commission_mode === m.value}
                  onChange={() => setForm({ ...form, commission_mode: m.value })}
                  className="mt-1 accent-blue-600"
                />
                <span>
                  <span className="block font-semibold text-gray-900 text-sm">{m.title}</span>
                  <span className="block text-xs text-gray-600 mt-0.5">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.commission_mode && <p className="text-xs text-red-600">{errors.commission_mode}</p>}
        </fieldset>

        {form.commission_mode === "default" ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
            <FormErrors errors={errors} fields={PROFIT_FIELDS} />
            AGIZA&apos;s commission on this vendor&apos;s sales follows the marketplace rates: a category or subcategory rate when one is set,
            otherwise the marketplace default (E-commerce → Marketplace Settings). The rate is captured on each order line when the order is placed.
          </div>
        ) : (
        <>
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Profit Agreement Settings</h3>
          <FormErrors errors={errors} fields={PROFIT_FIELDS} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pa-type" className="block text-sm font-semibold text-gray-700 mb-2">
                Profit Type
                <span className="text-xs text-gray-500 font-normal ml-2">(How profit is calculated)</span>
              </label>
              <Select id="pa-type" value={form.profit_type} onChange={(e) => setForm({ ...form, profit_type: e.target.value as ProfitType })}>
                <option value="fixed">Fixed Amount (TSh)</option>
                <option value="percent">Percentage (%)</option>
              </Select>
              {errors.profit_type && <p className="text-xs text-red-600 mt-1">{errors.profit_type}</p>}
            </div>
            <div>
              <label htmlFor="pa-value" className="block text-sm font-semibold text-gray-700 mb-2">
                Profit Value
                <span className="text-xs text-gray-500 font-normal ml-2">(Amount or percentage)</span>
              </label>
              <ProfitValueInput id="pa-value" type={form.profit_type} value={form.profit_value} onChange={(v) => setForm({ ...form, profit_value: v })} error={errors.profit_value} />
              {errors.profit_value && <p className="text-xs text-red-600 mt-1">{errors.profit_value}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="pa-scope" className="block text-sm font-semibold text-gray-700 mb-2">
              Profit Scope
              <span className="text-xs text-gray-500 font-normal ml-2">(How profit is applied)</span>
            </label>
            <Select id="pa-scope" value={form.profit_scope} onChange={(e) => setForm({ ...form, profit_scope: e.target.value as ProfitScope })}>
              <option value="all">Apply to All Products</option>
              <option value="per_product">Configure Per Product</option>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {form.profit_scope === "all"
                ? "This profit rate will be applied uniformly to all vendor products"
                : "Each product can have its own custom profit setting"}
            </p>
          </div>
        </div>

        <ExampleCalculation type={form.profit_type} value={form.profit_value} />
        </>
        )}
      </form>
    </Modal>
  );
}
