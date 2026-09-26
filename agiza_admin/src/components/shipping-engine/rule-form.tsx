"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  CURRENCY_PREFIX,
  DIVISOR_OPTIONS,
  engine,
  PRICING_OPTIONS,
  seKeys,
  type Currency,
  type PricingModel,
  type Scope,
  type ShippingRule,
} from "@/lib/api/services/shipping-engine";

import { applyFieldErrors, useCarrierOptions, useEngineMutation, useProfileOptions, useRouteOptions } from "./hooks";
import { Btn, EngineModal, FormField, Input, SectionLabel, Select, ToggleOption } from "./ui";

const num = z.string().refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), "Enter a valid number");

const schema = z
  .object({
    origin: z.string().min(1, "Select an origin"),
    route: z.string().min(1, "Select a destination"),
    method: z.string().min(1, "Select a shipping method"),
    applies_to: z.enum(["general", "profile", "product"]),
    profile: z.string(),
    product_sku: z.string().max(64),
    pricing_model: z.enum(["per_kg", "per_cbm", "per_vol_weight", "per_item", "fixed", "manual"]),
    rate: num,
    currency: z.enum(["TZS", "USD", "AED", "CNY"]),
    volumetric_divisor: z.string(),
    min_weight_kg: num,
    max_weight_kg: num,
    min_cbm: num,
    max_cbm: num,
    min_volumetric_kg: num,
    max_volumetric_kg: num,
    minimum_charge: num,
    eta_min_days: num,
    eta_max_days: num,
    carrier: z.string(),
    status: z.enum(["active", "inactive"]),
  })
  .superRefine((v, ctx) => {
    if (v.applies_to === "profile" && !v.profile) ctx.addIssue({ code: "custom", path: ["profile"], message: "Select a shipping profile" });
    if (v.applies_to === "product" && !v.product_sku.trim())
      ctx.addIssue({ code: "custom", path: ["product_sku"], message: "Enter the product SKU" });
    if (v.pricing_model !== "manual" && !(Number(v.rate) > 0))
      ctx.addIssue({ code: "custom", path: ["rate"], message: "Enter a rate greater than zero" });
    const pairs: [keyof typeof v, keyof typeof v, string][] = [
      ["min_weight_kg", "max_weight_kg", "weight"],
      ["min_cbm", "max_cbm", "CBM"],
      ["min_volumetric_kg", "max_volumetric_kg", "volumetric weight"],
      ["eta_min_days", "eta_max_days", "days"],
    ];
    for (const [lo, hi, label] of pairs) {
      if (v[lo] !== "" && v[hi] !== "" && Number(v[lo]) > Number(v[hi]))
        ctx.addIssue({ code: "custom", path: [hi], message: `Max ${label} must be ≥ min` });
    }
  });
type Values = z.infer<typeof schema>;
const FIELDS = Object.keys(schema.shape) as (keyof Values)[];

const blank = (currency: Currency): Values => ({
  origin: "", route: "", method: "", applies_to: "profile", profile: "", product_sku: "", pricing_model: "per_kg",
  rate: "", currency, volumetric_divisor: "5000", min_weight_kg: "", max_weight_kg: "", min_cbm: "", max_cbm: "",
  min_volumetric_kg: "", max_volumetric_kg: "", minimum_charge: "", eta_min_days: "", eta_max_days: "", carrier: "",
  status: "active",
});

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));
const originKey = (r: { origin_country: number; origin_city: number | null }) => `${r.origin_country}:${r.origin_city ?? ""}`;

function etaPreview(min: string, max: string): string {
  if (min === "" && max === "") return "3–7 days";
  if (min === "0" && (max === "" || max === "0")) return "Same day";
  if (max === "" || min === max) return `${max || min} days`;
  if (min === "") return `Up to ${max} days`;
  return `${min}–${max} days`;
}

/** Create / edit a pricing rule (design: CreateRuleForm, sections 1–9). */
export function RuleForm({
  open,
  onClose,
  rule,
  type,
}: {
  open: boolean;
  onClose: () => void;
  rule?: ShippingRule | null;
  type: Scope;
}) {
  const settings = useQuery({ queryKey: seKeys.settings, queryFn: engine.settings.get });
  const routes = useRouteOptions();
  const profiles = useProfileOptions();
  const carriers = useCarrierOptions();
  const defaultCurrency: Currency =
    (type === "local" ? settings.data?.local_currency : settings.data?.international_currency) ?? (type === "local" ? "TZS" : "USD");

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: blank(defaultCurrency) });
  const [formError, setFormError] = useState<string | null>(null);
  const [addAnother, setAddAnother] = useState(false);

  const fromRule = (r: ShippingRule): Values => ({
    origin: "",
    route: String(r.route),
    method: String(r.method),
    applies_to: r.applies_to,
    profile: r.profile ? String(r.profile) : "",
    product_sku: r.product_sku,
    pricing_model: r.pricing_model,
    rate: s(r.rate),
    currency: r.currency,
    volumetric_divisor: String(r.volumetric_divisor ?? settings.data?.default_volumetric_divisor ?? 5000),
    min_weight_kg: s(r.min_weight_kg),
    max_weight_kg: s(r.max_weight_kg),
    min_cbm: s(r.min_cbm),
    max_cbm: s(r.max_cbm),
    min_volumetric_kg: s(r.min_volumetric_kg),
    max_volumetric_kg: s(r.max_volumetric_kg),
    minimum_charge: s(r.minimum_charge),
    eta_min_days: s(r.eta_min_days),
    eta_max_days: s(r.eta_max_days),
    carrier: r.carrier ? String(r.carrier) : "",
    status: r.status,
  });

  const typeRoutes = useMemo(() => (routes.data ?? []).filter((r) => r.type === type), [routes.data, type]);

  // Initialise once per opening. Later refetches of routes/settings (e.g. after
  // "Save & Add Another" invalidates the cache) must not wipe what the user kept.
  const initialisedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      initialisedFor.current = null;
      return;
    }
    const target = rule ? `rule:${rule.id}` : "new";
    if (initialisedFor.current === target || !routes.data || !settings.data) return;
    initialisedFor.current = target;
    const values = rule ? fromRule(rule) : blank(defaultCurrency);
    if (rule) {
      const route = routes.data?.find((r) => r.id === rule.route);
      if (route) values.origin = originKey(route);
    }
    values.volumetric_divisor = rule?.volumetric_divisor
      ? String(rule.volumetric_divisor)
      : String(settings.data?.default_volumetric_divisor ?? 5000);
    form.reset(values);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule?.id, routes.data, settings.data]);

  const [origin, routeId, methodId, appliesTo, pricing, currency, etaMin, etaMax] = useWatch({
    control: form.control,
    name: ["origin", "route", "method", "applies_to", "pricing_model", "currency", "eta_min_days", "eta_max_days"],
  });

  const origins = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of typeRoutes) map.set(originKey(r), r.origin_label);
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [typeRoutes]);
  const destinations = typeRoutes.filter((r) => originKey(r) === origin);
  const selectedRoute = typeRoutes.find((r) => String(r.id) === routeId);
  const routeMethods = useMemo(() => {
    if (!selectedRoute) return [];
    return selectedRoute.methods.map((id, i) => ({ id, name: selectedRoute.method_names[i] }));
  }, [selectedRoute]);

  // Keep dependent selections valid when a parent changes.
  useEffect(() => {
    if (routeId && !destinations.some((r) => String(r.id) === routeId)) form.setValue("route", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);
  useEffect(() => {
    if (methodId && !routeMethods.some((m) => String(m.id) === methodId)) form.setValue("method", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, routeMethods.length]);

  const mutation = useEngineMutation(
    (payload: Record<string, unknown>) => (rule ? engine.rules.update(rule.id, payload) : engine.rules.create(payload)),
    {
      success: (r) => `Rule ${(r as ShippingRule).code} ${rule ? "updated" : "created"}`,
      onSuccess: () => {
        if (addAnother && !rule) {
          // Keep route/method/pricing context; clear the target and amounts.
          const v = form.getValues();
          form.reset({ ...v, profile: "", product_sku: "", rate: "", minimum_charge: "" });
        } else {
          onClose();
        }
      },
    },
  );

  const submit = (another: boolean) =>
    form.handleSubmit((v) => {
      setAddAnother(another);
      setFormError(null);
      const n = (x: string) => (x === "" ? null : x);
      const payload: Record<string, unknown> = {
        route: Number(v.route),
        method: Number(v.method),
        applies_to: v.applies_to,
        profile: v.applies_to === "profile" ? Number(v.profile) : null,
        product_sku: v.applies_to === "product" ? v.product_sku.trim() : "",
        pricing_model: v.pricing_model,
        rate: v.pricing_model === "manual" ? null : v.rate,
        currency: v.currency,
        volumetric_divisor: v.pricing_model === "per_vol_weight" ? Number(v.volumetric_divisor) : null,
        min_weight_kg: n(v.min_weight_kg),
        max_weight_kg: n(v.max_weight_kg),
        min_cbm: n(v.min_cbm),
        max_cbm: n(v.max_cbm),
        min_volumetric_kg: n(v.min_volumetric_kg),
        max_volumetric_kg: n(v.max_volumetric_kg),
        minimum_charge: v.pricing_model === "manual" ? null : n(v.minimum_charge),
        eta_min_days: v.eta_min_days === "" ? null : Number(v.eta_min_days),
        eta_max_days: v.eta_max_days === "" ? null : Number(v.eta_max_days),
        carrier: v.carrier ? Number(v.carrier) : null,
        status: v.status,
      };
      mutation.mutate(payload, { onError: (err) => setFormError(applyFieldErrors(err, form.setError, FIELDS)) });
    })();

  const { errors } = form.formState;
  const prefix = CURRENCY_PREFIX[currency as Currency];
  const noRoutes = routes.data && typeRoutes.length === 0;

  const rateRow = (placeholder: string, suffix: string, width = "max-w-32") => (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Currency"
        className="w-24"
        {...form.register("currency")}
      >
        {(["TZS", "USD", "AED", "CNY"] as const).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Input placeholder={placeholder} className={width} inputMode="decimal" invalid={!!errors.rate} aria-label="Rate" {...form.register("rate")} />
      <span className="text-sm text-gray-500">{suffix}</span>
      {errors.rate && <p className="w-full text-xs text-red-600">{errors.rate.message}</p>}
    </div>
  );

  return (
    <EngineModal
      open={open}
      onClose={onClose}
      size="2xl"
      title={rule ? `Edit Rule ${rule.code}` : `Create ${type === "local" ? "Local Delivery" : "International Shipping"} Rule`}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          {!rule && (
            <Btn variant="secondary" onClick={() => submit(true)} disabled={mutation.isPending}>
              Save &amp; Add Another
            </Btn>
          )}
          <Btn variant="primary" onClick={() => submit(false)} loading={mutation.isPending && !addAnother}>
            Save Rule
          </Btn>
        </>
      }
    >
      <div className="space-y-6">
        {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
        {noRoutes && (
          <p className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            There are no {type === "local" ? "local" : "international"} routes yet. Create a route first, then add its rules.
          </p>
        )}

        <div>
          <SectionLabel>Section 1 — Route</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Origin" required error={errors.origin?.message} htmlFor="rule-origin">
              <Select id="rule-origin" invalid={!!errors.origin} disabled={!routes.data || !settings.data} {...form.register("origin")}>
                <option value="">Select origin...</option>
                {origins.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Destination / Zone" required error={errors.route?.message} htmlFor="rule-destination">
              <Select id="rule-destination" invalid={!!errors.route} disabled={!origin} {...form.register("route")}>
                <option value="">Select destination...</option>
                {destinations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.destination_label}
                    {r.destination_kind === "city" ? " (specific city)" : ""}
                    {r.status !== "active" ? " — inactive route" : ""}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </div>

        <div>
          <SectionLabel>Section 2 — Shipping Method</SectionLabel>
          <Select aria-label="Shipping method" invalid={!!errors.method} disabled={!selectedRoute} {...form.register("method")}>
            <option value="">Select method...</option>
            {routeMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          {errors.method && <p className="mt-1 text-xs text-red-600">{errors.method.message}</p>}
        </div>

        <div>
          <SectionLabel>Section 3 — Applies To</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: "general", label: "General Route" },
                { id: "profile", label: "Shipping Profile" },
                { id: "product", label: "Specific Product" },
              ] as const
            ).map((opt) => (
              <ToggleOption key={opt.id} selected={appliesTo === opt.id} onClick={() => form.setValue("applies_to", opt.id)}>
                {opt.label}
              </ToggleOption>
            ))}
          </div>
          {appliesTo === "general" && (
            <p className="mt-1.5 text-xs text-gray-400">
              Applies to every product on this route and method unless a Shipping Profile or Specific Product rule matches.
            </p>
          )}
          {appliesTo === "profile" && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5" htmlFor="rule-profile">
                Shipping Profile
              </label>
              <Select id="rule-profile" invalid={!!errors.profile} {...form.register("profile")}>
                <option value="">Select profile...</option>
                {(profiles.data ?? [])
                  .filter((p) => p.status === "active" || String(p.id) === form.getValues("profile"))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
              {errors.profile ? (
                <p className="mt-1 text-xs text-red-600">{errors.profile.message}</p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-400">
                  This rule applies to all products assigned to the selected Shipping Profile. Special handling requirements come from the profile.
                </p>
              )}
            </div>
          )}
          {appliesTo === "product" && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5" htmlFor="rule-sku">
                Product
              </label>
              <Input id="rule-sku" placeholder="Product SKU, e.g. ELEC-SAM-A54" className="uppercase" invalid={!!errors.product_sku} {...form.register("product_sku")} />
              {errors.product_sku ? (
                <p className="mt-1 text-xs text-red-600">{errors.product_sku.message}</p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-400">
                  A specific product rule overrides the Shipping Profile rule for this product only.
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Section 4 — Pricing Model</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
            {PRICING_OPTIONS.map((opt) => (
              <ToggleOption
                key={opt.id}
                selected={pricing === opt.id}
                onClick={() => form.setValue("pricing_model", opt.id as PricingModel)}
              >
                {opt.label}
              </ToggleOption>
            ))}
          </div>
          {pricing === "per_kg" && rateRow("Rate", "per KG (actual weight)")}
          {pricing === "per_cbm" && (
            <div className="space-y-2">
              {rateRow("Rate", "per CBM (m³)")}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-start gap-1.5">
                <Info className="size-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>
                  CBM is calculated from product dimensions: <strong>L × W × H ÷ 1,000,000</strong>. Set dimensions on each product.
                </span>
              </div>
            </div>
          )}
          {pricing === "per_vol_weight" && (
            <div className="space-y-2">
              {rateRow("Rate", "per volumetric KG")}
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <label htmlFor="rule-divisor" className="text-xs text-gray-500">
                  Divisor:
                </label>
                <select
                  id="rule-divisor"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  {...form.register("volumetric_divisor")}
                >
                  {DIVISOR_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-400">Vol. KG = L×W×H ÷ divisor</span>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 flex items-start gap-1.5">
                <Info className="size-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>
                  The engine automatically uses <strong>whichever is greater</strong> — actual weight or volumetric weight — when applying this rate.
                </span>
              </div>
            </div>
          )}
          {pricing === "per_item" && rateRow("Rate", "per item")}
          {pricing === "fixed" && rateRow("Fixed price", "per shipment (flat rate)", "max-w-48")}
          {pricing === "manual" && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-700 flex items-center gap-2">
              <AlertCircle className="size-4 flex-shrink-0" />
              Manual quotation will be required for each shipment using this rule.
            </div>
          )}
        </div>

        <div>
          <SectionLabel>Section 5 — Conditions (Optional)</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(
              [
                ["Weight Range", "min_weight_kg", "max_weight_kg", "Min KG", "Max KG"],
                ["Volume Range (CBM)", "min_cbm", "max_cbm", "Min CBM", "Max CBM"],
                ["Volumetric Weight Range", "min_volumetric_kg", "max_volumetric_kg", "Min KG", "Max KG"],
              ] as const
            ).map(([title, lo, hi, loPh, hiPh]) => (
              <div key={title}>
                <p className="text-xs font-medium text-gray-600 mb-2">{title}</p>
                <div className="flex items-center gap-2">
                  <Input placeholder={loPh} inputMode="decimal" aria-label={`${title} minimum`} invalid={!!errors[lo]} {...form.register(lo)} />
                  <span className="text-sm text-gray-400">—</span>
                  <Input placeholder={hiPh} inputMode="decimal" aria-label={`${title} maximum`} invalid={!!errors[hi]} {...form.register(hi)} />
                </div>
                {(errors[lo] || errors[hi]) && <p className="mt-1 text-xs text-red-600">{errors[hi]?.message ?? errors[lo]?.message}</p>}
              </div>
            ))}
          </div>
        </div>

        {pricing !== "manual" && (
          <div>
            <SectionLabel>Section 6 — Minimum Charge</SectionLabel>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 font-medium">{prefix}</span>
              <Input
                placeholder={currency === "TZS" ? "e.g. 5,000" : "e.g. 30"}
                className="max-w-48"
                inputMode="decimal"
                aria-label="Minimum charge"
                invalid={!!errors.minimum_charge}
                {...form.register("minimum_charge")}
              />
              <span className="text-sm text-gray-500">minimum shipping charge</span>
            </div>
            {errors.minimum_charge && <p className="mt-1 text-xs text-red-600">{errors.minimum_charge.message}</p>}
          </div>
        )}

        <div>
          <SectionLabel>Section 7 — Delivery Estimate</SectionLabel>
          <div className="flex items-center gap-2">
            <Input placeholder="Min" className="max-w-24" inputMode="numeric" aria-label="Minimum days" {...form.register("eta_min_days")} />
            <span className="text-sm text-gray-500">to</span>
            <Input placeholder="Max" className="max-w-24" inputMode="numeric" aria-label="Maximum days" invalid={!!errors.eta_max_days} {...form.register("eta_max_days")} />
            <span className="text-sm text-gray-500">days</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Displayed to customer as: {etaPreview(etaMin, etaMax)}</p>
          {errors.eta_max_days && <p className="mt-1 text-xs text-red-600">{errors.eta_max_days.message}</p>}
        </div>

        <div>
          <SectionLabel>Section 8 — Carrier (Optional)</SectionLabel>
          <Select aria-label="Carrier" {...form.register("carrier")}>
            <option value="">No specific carrier</option>
            {(carriers.data ?? [])
              .filter((c) => c.status === "active" || String(c.id) === form.getValues("carrier"))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <Info className="size-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            Special handling requirements (battery, fragile, restricted, etc.) are automatically inherited from the product&apos;s{" "}
            <strong>Shipping Profile</strong>. No need to repeat them here.
          </p>
        </div>

        <div>
          <SectionLabel>Section 9 — Status</SectionLabel>
          <div className="flex gap-3">
            {(["active", "inactive"] as const).map((st) => (
              <label key={st} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" value={st} className="text-blue-600" {...form.register("status")} />
                {st === "active" ? "Active" : "Inactive"}
              </label>
            ))}
          </div>
        </div>
      </div>
    </EngineModal>
  );
}
