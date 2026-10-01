"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useEngineAccess } from "@/components/shipping-engine/hooks";
import { Btn, EnginePage, FormField, Input, PageHeader, SectionCard, Select, Toggle } from "@/components/shipping-engine/ui";
import { ErrorState } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";
import { DIVISOR_OPTIONS, engine, seKeys, type Currency, type EngineSettings } from "@/lib/api/services/shipping-engine";
import { formatDateTime } from "@/lib/format";

const rate = z.string().refine((v) => v === "" || Number(v.replace(/,/g, "")) > 0, "Enter a rate greater than zero");
const schema = z.object({
  local_currency: z.enum(["TZS", "USD", "AED", "CNY"]),
  international_currency: z.enum(["TZS", "USD", "AED", "CNY"]),
  display_currency: z.enum(["TZS", "USD", "AED", "CNY"]),
  exchange_rate_source: z.enum(["manual", "auto"]),
  default_volumetric_divisor: z.string(),
  no_rule_fallback: z.enum(["manual_quote", "block", "error"]),
  cbm_method: z.enum(["dimensions", "manual"]),
  weight_rounding: z.enum(["half_kg", "one_kg", "exact"]),
  apply_minimum_charge: z.boolean(),
  show_details_to_customers: z.boolean(),
  import_payment_window_hours: z.string().refine((v) => /^\d+$/.test(v.trim()) && Number(v) >= 1, "Enter a whole number of hours (1 or more)"),
  usd_rate: rate,
  aed_rate: rate,
  cny_rate: rate,
});
type Values = z.infer<typeof schema>;

const DEFAULTS: Omit<Values, "usd_rate" | "aed_rate" | "cny_rate"> = {
  local_currency: "TZS",
  international_currency: "USD",
  display_currency: "TZS",
  exchange_rate_source: "manual",
  default_volumetric_divisor: "5000",
  no_rule_fallback: "manual_quote",
  cbm_method: "dimensions",
  weight_rounding: "half_kg",
  apply_minimum_charge: true,
  show_details_to_customers: true,
  import_payment_window_hours: "48",
};

const rateOf = (s: EngineSettings, base: Currency) => {
  const r = s.current_rates.find((x) => x.base_currency === base)?.rate;
  return r ? String(Number(r)) : "";
};
const toValues = (s: EngineSettings): Values => ({
  local_currency: s.local_currency,
  international_currency: s.international_currency,
  display_currency: s.display_currency,
  exchange_rate_source: s.exchange_rate_source,
  default_volumetric_divisor: String(s.default_volumetric_divisor),
  no_rule_fallback: s.no_rule_fallback,
  cbm_method: s.cbm_method,
  weight_rounding: s.weight_rounding,
  apply_minimum_charge: s.apply_minimum_charge,
  show_details_to_customers: s.show_details_to_customers,
  import_payment_window_hours: String(s.import_payment_window_hours),
  usd_rate: rateOf(s, "USD"),
  aed_rate: rateOf(s, "AED"),
  cny_rate: rateOf(s, "CNY"),
});

export function EngineSettingsView() {
  const { canManage } = useEngineAccess();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: seKeys.settings, queryFn: engine.settings.get });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { ...DEFAULTS, usd_rate: "", aed_rate: "", cny_rate: "" } });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) form.reset(toValues(q.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const save = form.handleSubmit(async (v) => {
    if (!q.data) return;
    setSaving(true);
    try {
      const { usd_rate, aed_rate, cny_rate, default_volumetric_divisor, import_payment_window_hours, ...rest } = v;
      await engine.settings.update({
        ...rest,
        default_volumetric_divisor: Number(default_volumetric_divisor) as EngineSettings["default_volumetric_divisor"],
        import_payment_window_hours: Number(import_payment_window_hours),
      });
      // Exchange rates are kept as a dated history; only changed values create a new entry.
      const target = v.display_currency;
      for (const [base, value] of [["USD", usd_rate], ["AED", aed_rate], ["CNY", cny_rate]] as const) {
        const clean = value.replace(/,/g, "");
        if (clean && clean !== rateOf(q.data, base) && base !== target) {
          await engine.exchangeRates.create({ base_currency: base, quote_currency: target, rate: clean });
        }
      }
      await qc.invalidateQueries({ queryKey: seKeys.all });
      toast.success("Shipping Engine settings saved");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        for (const [field, message] of Object.entries(err.fieldErrors)) form.setError(field as keyof Values, { message });
        toast.error(err.message);
      } else toast.error(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  });

  const resetDefaults = () => {
    form.reset({ ...form.getValues(), ...DEFAULTS }, { keepDefaultValues: true });
    toast.info("Defaults restored — click Save Settings to apply them");
  };

  const { errors, isDirty } = form.formState;
  const disabled = !canManage;
  const displayCurrency = form.watch("display_currency");
  const rateLabel = (base: string) => `${base} to ${displayCurrency === "TZS" ? "TSh" : displayCurrency} Rate`;
  const effective = (base: Currency) => q.data?.current_rates.find((r) => r.base_currency === base)?.effective_date;

  if (q.isError) {
    return (
      <EnginePage>
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      </EnginePage>
    );
  }

  return (
    <EnginePage>
      <PageHeader title="Shipping Engine Settings" description="Configure global defaults and engine behavior" />
      {!canManage && (
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <Lock className="size-4 text-gray-400" /> You can view these settings. Changing them requires Shipping Engine manage access.
        </div>
      )}
      <form onSubmit={save}>
        <fieldset disabled={disabled || !q.data} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Default Currency">
            <div className="p-5 space-y-4">
              <FormField label="Local Delivery Currency" required>
                <Select {...form.register("local_currency")}>
                  <option value="TZS">TSh — Tanzanian Shilling (TZS)</option>
                </Select>
              </FormField>
              <FormField label="International Shipping Currency" required>
                <Select {...form.register("international_currency")}>
                  <option value="USD">USD — US Dollar</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="CNY">CNY — Chinese Yuan</option>
                </Select>
              </FormField>
              <FormField label="Display Currency (Customer-facing)" required>
                <Select {...form.register("display_currency")}>
                  <option value="TZS">TSh — Tanzanian Shilling (TZS)</option>
                </Select>
              </FormField>
              <FormField label="Exchange Rate Source">
                <Select {...form.register("exchange_rate_source")}>
                  <option value="manual">Manual (set rate below)</option>
                  <option value="auto" disabled>
                    Auto (live rate API) — not configured
                  </option>
                </Select>
              </FormField>
              {(["USD", "AED", "CNY"] as const).map((base) => {
                const name = `${base.toLowerCase()}_rate` as "usd_rate" | "aed_rate" | "cny_rate";
                const eff = effective(base);
                return (
                  <FormField
                    key={base}
                    label={rateLabel(base)}
                    error={errors[name]?.message}
                    hint={
                      base === "USD"
                        ? `Used to convert international shipping costs to TSh${eff ? ` · effective ${eff}` : ""}`
                        : eff
                          ? `Effective ${eff}`
                          : `Needed only for rules priced in ${base}`
                    }
                  >
                    <Input inputMode="decimal" placeholder={base === "USD" ? "e.g. 2,550" : "Not set"} {...form.register(name)} />
                  </FormField>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Engine Behavior">
            <div className="p-5 space-y-4">
              <FormField label="No Rule Fallback">
                <Select {...form.register("no_rule_fallback")}>
                  <option value="manual_quote">Return Manual Quote</option>
                  <option value="block">Block checkout</option>
                  <option value="error">Return error to API</option>
                </Select>
              </FormField>
              <FormField label="CBM Calculation Method">
                <Select {...form.register("cbm_method")}>
                  <option value="dimensions">Length × Width × Height ÷ 1,000,000</option>
                  <option value="manual">Manual input only</option>
                </Select>
              </FormField>
              <FormField label="Weight Rounding">
                <Select {...form.register("weight_rounding")}>
                  <option value="half_kg">Round up to nearest 0.5 KG</option>
                  <option value="one_kg">Round up to nearest 1 KG</option>
                  <option value="exact">Exact weight</option>
                </Select>
              </FormField>
              <FormField
                label="Payment deadline for imported items (hours)"
                hint="Orders with imported items are cancelled automatically if not fully paid within this time"
                error={form.formState.errors.import_payment_window_hours?.message}
                htmlFor="import-window"
              >
                <Input id="import-window" inputMode="numeric" {...form.register("import_payment_window_hours")} />
              </FormField>
              <FormField label="Default Volumetric Divisor" hint="Used by volumetric-weight rules that don't set their own divisor">
                <Select {...form.register("default_volumetric_divisor")}>
                  {DIVISOR_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-700">Apply minimum charge automatically</p>
                  <p className="text-xs text-gray-400">Engine enforces minimum charge without admin action</p>
                </div>
                <Controller
                  control={form.control}
                  name="apply_minimum_charge"
                  render={({ field }) => <Toggle checked={field.value} onChange={field.onChange} disabled={disabled} id="toggle-min" />}
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Show shipping details to customers</p>
                  <p className="text-xs text-gray-400">Customers see cost + delivery estimate only (not zones or rules)</p>
                </div>
                <Controller
                  control={form.control}
                  name="show_details_to_customers"
                  render={({ field }) => <Toggle checked={field.value} onChange={field.onChange} disabled={disabled} id="toggle-show" />}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="API Configuration" className="lg:col-span-2">
            <div className="p-5">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Shipping Engine API Response Format</p>
                <pre className="text-xs text-gray-600 font-mono overflow-x-auto">{`{
  "shipping_cost": 127500,
  "shipping_cost_display": "TSh 127,500",
  "shipping_method": "Air Cargo",
  "estimated_delivery": "7–14 days",
  "applicable_rule": "SR-0003",
  "carrier": "SF Express",
  "requires_special_handling": true
}`}</pre>
              </div>
              <p className="text-xs text-gray-400">
                The mobile app and website request shipping information from this engine. Customers <strong>never</strong> see internal
                zones, rules, or pricing logic.
              </p>
            </div>
          </SectionCard>
        </fieldset>

        {canManage && (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            {q.data?.updated_by_name && (
              <span className="text-xs text-gray-400 mr-auto">
                Last changed by {q.data.updated_by_name} · {formatDateTime(q.data.updated_at)}
              </span>
            )}
            <Btn variant="secondary" onClick={resetDefaults} disabled={saving}>
              Reset to Defaults
            </Btn>
            <Btn variant="primary" type="submit" loading={saving} disabled={!isDirty}>
              Save Settings
            </Btn>
          </div>
        )}
      </form>
    </EnginePage>
  );
}
