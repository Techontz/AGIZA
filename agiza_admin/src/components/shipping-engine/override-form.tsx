"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { CURRENCY_PREFIX, engine, PRICING_OPTIONS, seKeys, type Currency, type RuleOverride } from "@/lib/api/services/shipping-engine";

import {
  applyFieldErrors,
  useCities,
  useCountries,
  useEngineMutation,
  useProfileOptions,
  useRegions,
  useRouteOptions,
  useZoneOptions,
} from "./hooks";
import { Btn, EngineModal, FormField, Input, Select, Textarea } from "./ui";

const schema = z
  .object({
    route: z.string().min(1, "Select a route"),
    destination: z.string(),
    profile: z.string(),
    pricing_model: z.enum(["per_kg", "per_cbm", "per_vol_weight", "per_item", "fixed"]),
    currency: z.enum(["TZS", "USD", "AED", "CNY"]),
    rate: z.string().refine((v) => Number(v) > 0, "Enter a price greater than zero"),
    reason: z.string().trim().min(1, "Explain why this override is needed"),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    status: z.enum(["active", "inactive"]),
  })
  .refine((v) => !v.start_date || !v.end_date || v.start_date <= v.end_date, {
    path: ["end_date"],
    message: "End date must be on or after the start date",
  });
type Values = z.infer<typeof schema>;
const FIELDS = ["route", "destination", "profile", "pricing_model", "currency", "rate", "reason", "start_date", "end_date", "status"];

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY: Values = {
  route: "", destination: "", profile: "", pricing_model: "per_kg", currency: "TZS", rate: "", reason: "",
  start_date: today(), end_date: "", status: "active",
};

/** Create / edit a rule override (design: inline Create Override modal). */
export function OverrideForm({ open, onClose, override }: { open: boolean; onClose: () => void; override?: RuleOverride | null }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const [formError, setFormError] = useState<string | null>(null);
  const routes = useRouteOptions();
  const profiles = useProfileOptions();
  const zones = useZoneOptions();
  const countries = useCountries();
  const tz = countries.data?.find((c) => c.iso2 === "TZ");
  const cities = useCities(tz?.id);
  const regions = useRegions(tz?.id);

  useEffect(() => {
    if (!open) return;
    form.reset(
      override
        ? {
            route: String(override.route),
            destination: override.destination_city ? `city:${override.destination_city}` : override.destination_region ? `region:${override.destination_region}` : "",
            profile: override.profile ? String(override.profile) : "",
            pricing_model: override.pricing_model,
            currency: override.currency,
            rate: String(Number(override.rate)),
            reason: override.reason,
            start_date: override.start_date,
            end_date: override.end_date,
            status: override.status,
          }
        : { ...EMPTY, start_date: today() },
    );
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, override?.id]);

  const [routeId, profileId, currency] = useWatch({ control: form.control, name: ["route", "profile", "currency"] });
  const route = routes.data?.find((r) => String(r.id) === routeId);

  // Default the override currency to the route's scope when a route is picked.
  useEffect(() => {
    if (route && !override) form.setValue("currency", route.type === "local" ? "TZS" : "USD");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id]);

  // Places an override may narrow to: members of the route's zone, or Tanzanian places for a country route.
  const destinationOptions = useMemo(() => {
    if (!route || route.destination_kind === "city") return [];
    if (route.destination_kind === "zone") {
      const zone = zones.data?.find((z) => z.id === route.destination_zone);
      return (zone?.destinations ?? [])
        .filter((d) => d.kind !== "country")
        .map((d) => ({ value: `${d.kind}:${d.ref_id}`, label: d.kind === "region" ? `${d.name} (region)` : d.name ?? "" }));
    }
    if (route.destination_country !== tz?.id) return [];
    return [
      ...(regions.data ?? []).map((r) => ({ value: `region:${r.id}`, label: `${r.name} (region)` })),
      ...(cities.data ?? []).map((c) => ({ value: `city:${c.id}`, label: c.name })),
    ];
  }, [route, zones.data, regions.data, cities.data, tz?.id]);

  // "Original Rule Rate" for reference: the profile rule (if any) else the general rule on this route.
  const routeRules = useQuery({
    queryKey: seKeys.list("rules", { route: routeId, status: "active" }),
    queryFn: () => engine.rules.all({ route: routeId, status: "active" }),
    enabled: Boolean(routeId),
  });
  const original = useMemo(() => {
    const rules = routeRules.data ?? [];
    const profileRule = profileId ? rules.find((r) => r.applies_to === "profile" && String(r.profile) === profileId) : undefined;
    const general = rules.find((r) => r.applies_to === "general");
    const rule = profileRule ?? general;
    return rule ? `${rule.rate_display} (${rule.code}${rule.method_name ? ` · ${rule.method_name}` : ""})` : routeId ? "No matching rule" : "";
  }, [routeRules.data, profileId, routeId]);

  const mutation = useEngineMutation(
    (payload: Record<string, unknown>) => (override ? engine.overrides.update(override.id, payload) : engine.overrides.create(payload)),
    { success: override ? "Override updated" : "Override created", onSuccess: onClose },
  );
  const submit = form.handleSubmit((v) => {
    setFormError(null);
    const [kind, id] = v.destination ? v.destination.split(":") : ["", ""];
    mutation.mutate(
      {
        route: Number(v.route),
        destination_city: kind === "city" ? Number(id) : null,
        destination_region: kind === "region" ? Number(id) : null,
        profile: v.profile ? Number(v.profile) : null,
        pricing_model: v.pricing_model,
        currency: v.currency,
        rate: v.rate,
        reason: v.reason,
        start_date: v.start_date,
        end_date: v.end_date,
        status: v.status,
      },
      // Destination errors (destination_city/region) aren't form fields, so they surface as the form-level message.
      { onError: (err) => setFormError(applyFieldErrors(err, form.setError, FIELDS)) },
    );
  });
  const { errors } = form.formState;

  return (
    <EngineModal
      open={open}
      onClose={onClose}
      title={override ? `Edit Override ${override.code}` : "Create Override"}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={submit} loading={mutation.isPending}>
            {override ? "Save Override" : "Create Override"}
          </Btn>
        </>
      }
    >
      {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Route" required error={errors.route?.message} htmlFor="ov-route">
          <Select id="ov-route" invalid={!!errors.route} {...form.register("route", { onChange: () => form.setValue("destination", "") })}>
            <option value="">Select route...</option>
            {(routes.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Specific Destination" hint="Override just this city or region without changing the zone" htmlFor="ov-dest">
          <Select id="ov-dest" disabled={destinationOptions.length === 0} {...form.register("destination")}>
            <option value="">{route?.destination_kind === "city" ? route.destination_label : "Whole route destination"}</option>
            {destinationOptions.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Shipping Profile / Category" htmlFor="ov-profile">
        <Select id="ov-profile" {...form.register("profile")}>
          <option value="">All Products</option>
          {(profiles.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Original Rule Rate" hint="For reference only">
          <Input value={original} placeholder="Select a route" disabled readOnly className="bg-gray-50" />
        </FormField>
        <FormField label="Override Price" required error={errors.rate?.message}>
          <div className="flex gap-2">
            <Select aria-label="Override currency" className="w-24 flex-shrink-0" {...form.register("currency")}>
              {(["TZS", "USD", "AED", "CNY"] as const).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input
              placeholder={`e.g. ${CURRENCY_PREFIX[currency as Currency]} 2,000`}
              inputMode="decimal"
              aria-label="Override price"
              invalid={!!errors.rate}
              {...form.register("rate")}
            />
          </div>
          <Select aria-label="Override pricing model" className="mt-2" {...form.register("pricing_model")}>
            {PRICING_OPTIONS.filter((p) => p.id !== "manual").map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label="Reason" required error={errors.reason?.message}>
        <Textarea rows={2} placeholder="Explain why this override is needed..." {...form.register("reason")} />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Start Date" required error={errors.start_date?.message}>
          <Input type="date" {...form.register("start_date")} />
        </FormField>
        <FormField label="End Date" required error={errors.end_date?.message}>
          <Input type="date" {...form.register("end_date")} />
        </FormField>
      </div>
      <FormField label="Status" required>
        <Select {...form.register("status")}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </FormField>
    </EngineModal>
  );
}
