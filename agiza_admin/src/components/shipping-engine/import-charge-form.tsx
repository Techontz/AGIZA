"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { catalogApi, catalogKeys } from "@/lib/api/services/catalog";
import { engine, IMPORT_CHARGE_KINDS, type ImportCharge } from "@/lib/api/services/shipping-engine";

import { applyFieldErrors, useCountries, useEngineMutation, useProfileOptions } from "./hooks";
import { Btn, EngineModal, FormField, Input, Select, Textarea } from "./ui";

const schema = z
  .object({
    name: z.string().trim().min(1, "Name the charge as customers will see it"),
    kind: z.enum(["customs_duty", "import_vat", "excise", "clearance", "other"]),
    origin_country: z.string(),
    category: z.string(),
    profile: z.string(),
    product_sku: z.string(),
    basis: z.enum(["percent", "fixed_item", "fixed_shipment"]),
    rate: z.string().refine((v) => v.trim() !== "" && Number(v) >= 0, "Enter zero or more"),
    currency: z.string(),
    percent_base: z.enum(["goods", "goods_shipping"]),
    treatment: z.enum(["included", "estimate"]),
    status: z.enum(["active", "inactive"]),
    notes: z.string(),
  })
  .refine((v) => v.basis === "percent" || v.currency !== "", { path: ["currency"], message: "Choose a currency" });
type Values = z.infer<typeof schema>;
const FIELDS = ["name", "kind", "origin_country", "category", "profile", "product_sku", "basis", "rate", "currency", "percent_base", "treatment", "status", "notes"];

const EMPTY: Values = {
  name: "", kind: "customs_duty", origin_country: "", category: "", profile: "", product_sku: "", basis: "percent", rate: "",
  currency: "", percent_base: "goods", treatment: "estimate", status: "active", notes: "",
};

/** Create / edit a customs / import charge rule. No rates are pre-filled: staff enter the legal rates. */
export function ImportChargeForm({ open, onClose, charge }: { open: boolean; onClose: () => void; charge?: ImportCharge | null }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const [formError, setFormError] = useState<string | null>(null);
  const countries = useCountries();
  const profiles = useProfileOptions();
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: ({ signal }) => catalogApi.categories.list(signal) });

  useEffect(() => {
    if (!open) return;
    form.reset(
      charge
        ? {
            name: charge.name,
            kind: charge.kind,
            origin_country: charge.origin_country ? String(charge.origin_country) : "",
            category: charge.category ? String(charge.category) : "",
            profile: charge.profile ? String(charge.profile) : "",
            product_sku: charge.product_sku,
            basis: charge.basis,
            rate: String(Number(charge.rate)),
            currency: charge.currency,
            percent_base: charge.percent_base,
            treatment: charge.treatment,
            status: charge.status,
            notes: charge.notes,
          }
        : EMPTY,
    );
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, charge?.id]);

  const basis = useWatch({ control: form.control, name: "basis" });
  const mutation = useEngineMutation(
    (payload: Record<string, unknown>) => (charge ? engine.importCharges.update(charge.id, payload) : engine.importCharges.create(payload)),
    { success: charge ? "Import charge updated" : "Import charge created", onSuccess: onClose },
  );
  const submit = form.handleSubmit((v) => {
    setFormError(null);
    mutation.mutate(
      {
        ...v,
        origin_country: v.origin_country ? Number(v.origin_country) : null,
        category: v.category ? Number(v.category) : null,
        profile: v.profile ? Number(v.profile) : null,
        currency: v.basis === "percent" ? "" : v.currency,
      },
      { onError: (err) => setFormError(applyFieldErrors(err, form.setError, FIELDS)) },
    );
  });
  const { errors } = form.formState;

  return (
    <EngineModal
      open={open}
      onClose={onClose}
      title={charge ? `Edit Import Charge ${charge.code}` : "Create Import Charge"}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={submit} loading={mutation.isPending}>
            {charge ? "Save Charge" : "Create Charge"}
          </Btn>
        </>
      }
    >
      {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Name shown to customers" required error={errors.name?.message} htmlFor="ic-name">
          <Input id="ic-name" placeholder="e.g. Import duty" invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField label="Kind" required htmlFor="ic-kind" hint="Different kinds add up; within a kind the most specific rule applies">
          <Select id="ic-kind" {...form.register("kind")}>
            {IMPORT_CHARGE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Applies to (leave empty for any)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Origin country" htmlFor="ic-origin">
          <Select id="ic-origin" {...form.register("origin_country")}>
            <option value="">Any country</option>
            {(countries.data ?? [])
              .filter((c) => c.iso2 !== "TZ")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Category" htmlFor="ic-category">
          <Select id="ic-category" {...form.register("category")}>
            <option value="">Any category</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Shipping profile" htmlFor="ic-profile">
          <Select id="ic-profile" {...form.register("profile")}>
            <option value="">Any profile</option>
            {(profiles.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Product SKU" htmlFor="ic-sku" error={errors.product_sku?.message}>
          <Input id="ic-sku" placeholder="Any product" {...form.register("product_sku")} />
        </FormField>
      </div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Calculated as" required htmlFor="ic-basis">
          <Select id="ic-basis" {...form.register("basis")}>
            <option value="percent">Percentage of value</option>
            <option value="fixed_item">Fixed amount per item</option>
            <option value="fixed_shipment">Fixed amount per order</option>
          </Select>
        </FormField>
        <FormField label={basis === "percent" ? "Rate (%)" : "Amount"} required error={errors.rate?.message ?? errors.currency?.message} htmlFor="ic-rate">
          <div className="flex gap-2">
            {basis !== "percent" && (
              <Select aria-label="Currency" className="w-24 flex-shrink-0" invalid={!!errors.currency} {...form.register("currency")}>
                <option value="">—</option>
                {(["TZS", "USD", "AED", "CNY"] as const).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
            <Input id="ic-rate" inputMode="decimal" placeholder={basis === "percent" ? "Set by staff" : "Amount"} invalid={!!errors.rate} {...form.register("rate")} />
          </div>
        </FormField>
        {basis === "percent" && (
          <FormField label="Percentage of" htmlFor="ic-base">
            <Select id="ic-base" {...form.register("percent_base")}>
              <option value="goods">Goods value</option>
              <option value="goods_shipping">Goods + international shipping</option>
            </Select>
          </FormField>
        )}
        <FormField label="At checkout" required htmlFor="ic-treatment" hint="Estimates are shown to the customer but not charged">
          <Select id="ic-treatment" {...form.register("treatment")}>
            <option value="estimate">Estimate only (paid separately)</option>
            <option value="included">Charged at checkout</option>
          </Select>
        </FormField>
        <FormField label="Status" required htmlFor="ic-status">
          <Select id="ic-status" {...form.register("status")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Internal notes" hint="Legal basis or source of the rate (not shown to customers)" htmlFor="ic-notes">
        <Textarea id="ic-notes" rows={2} {...form.register("notes")} />
      </FormField>
    </EngineModal>
  );
}
