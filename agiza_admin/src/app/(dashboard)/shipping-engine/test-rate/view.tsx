"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, FlaskConical, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useCities, useCountries, useMethodOptions, useProfileOptions, useZoneOptions } from "@/components/shipping-engine/hooks";
import { RateResult } from "@/components/shipping-engine/rate-result";
import { Btn, EnginePage, FormField, Input, PageHeader, SectionCard, Select } from "@/components/shipping-engine/ui";
import { ApiError } from "@/lib/api/client";
import { engine, seKeys, type CalculationResult } from "@/lib/api/services/shipping-engine";
import { pageMeta } from "@/lib/nav";

const positive = (label: string) => z.string().refine((v) => Number(v) > 0, `${label} must be greater than zero`);
const optionalPositive = z.string().refine((v) => v === "" || Number(v) > 0, "Must be greater than zero");

const schema = z
  .object({
    origin: z.string().min(1, "Select an origin"),
    destination: z.string().min(1, "Select a destination"),
    method: z.string().min(1, "Select a shipping method"),
    profile: z.string(),
    product_sku: z.string().max(64),
    weight_kg: positive("Weight"),
    quantity: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, "Quantity must be a whole number ≥ 1"),
    length_cm: optionalPositive,
    width_cm: optionalPositive,
    height_cm: optionalPositive,
    cbm: optionalPositive,
  })
  .refine((v) => [v.length_cm, v.width_cm, v.height_cm].every((d) => d === "") || [v.length_cm, v.width_cm, v.height_cm].every((d) => d !== ""), {
    path: ["height_cm"],
    message: "Enter length, width and height together",
  });
type Values = z.infer<typeof schema>;

export function TestRateView() {
  const meta = pageMeta["/shipping-engine/test-rate"];
  const params = useSearchParams();
  const settings = useQuery({ queryKey: seKeys.settings, queryFn: engine.settings.get });
  const manualCbm = settings.data?.cbm_method === "manual";
  const countries = useCountries();
  const tz = countries.data?.find((c) => c.iso2 === "TZ");
  const tzCities = useCities(tz?.id);
  const zones = useZoneOptions();
  const methods = useMethodOptions();
  const profiles = useProfileOptions();

  // Values can be pre-filled from the URL (e.g. "Test Shipping Rate" on a product).
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      origin: params.get("origin") ?? "",
      destination: params.get("destination") ?? "",
      method: params.get("method") ?? "",
      profile: params.get("profile") ?? "",
      product_sku: params.get("sku") ?? "",
      weight_kg: params.get("weight") ?? "1.5",
      quantity: params.get("quantity") ?? "1",
      length_cm: params.get("length") ?? "30",
      width_cm: params.get("width") ?? "25",
      height_cm: params.get("height") ?? "15",
      cbm: params.get("cbm") ?? "",
    },
  });
  const [l, w, h] = useWatch({ control: form.control, name: ["length_cm", "width_cm", "height_cm"] });
  const autoCbm = useMemo(() => {
    const [a, b, c] = [l, w, h].map(Number);
    return a > 0 && b > 0 && c > 0 ? (a * b * c) / 1_000_000 : null;
  }, [l, w, h]);

  const [error, setError] = useState<string | null>(null);
  const calc = useMutation({
    mutationFn: engine.calculate,
    onMutate: () => setError(null),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 400) {
        const fields = err.fieldErrors;
        setError(Object.values(fields).join(" ") || err.message);
      } else setError(err instanceof Error ? err.message : "Calculation failed");
    },
  });

  const submit = form.handleSubmit((v) => {
    const [ok, oid] = v.origin.split(":");
    const [dk, did] = v.destination.split(":");
    const dims = v.length_cm !== "" && !manualCbm;
    calc.mutate({
      origin_country: ok === "country" ? Number(oid) : (tz?.id as number),
      origin_city: ok === "city" ? Number(oid) : null,
      destination_country: dk === "country" ? Number(did) : null,
      destination_city: dk === "city" ? Number(did) : null,
      destination_zone: dk === "zone" ? Number(did) : null,
      method: Number(v.method),
      profile: v.profile ? Number(v.profile) : null,
      product_sku: v.product_sku.trim(),
      weight_kg: v.weight_kg,
      quantity: Number(v.quantity),
      length_cm: dims ? v.length_cm : null,
      width_cm: dims ? v.width_cm : null,
      height_cm: dims ? v.height_cm : null,
      cbm: manualCbm && v.cbm ? v.cbm : null,
    });
  });

  const { errors } = form.formState;
  const loading = calc.isPending;
  const result: CalculationResult | undefined = calc.data;

  return (
    <EnginePage>
      <PageHeader title={meta.title} description={meta.description} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <SectionCard title="Shipment Details">
            <form className="p-5 space-y-4" onSubmit={submit} noValidate>
              <FormField label="Origin" required error={errors.origin?.message} htmlFor="tr-origin">
                <Select id="tr-origin" invalid={!!errors.origin} {...form.register("origin")}>
                  <option value="">Select origin...</option>
                  <optgroup label="International origins">
                    {(countries.data ?? [])
                      .filter((c) => c.is_sourcing_origin && c.iso2 !== "TZ")
                      .map((c) => (
                        <option key={c.id} value={`country:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Tanzania">
                    {(tzCities.data ?? []).map((c) => (
                      <option key={c.id} value={`city:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </FormField>
              <FormField label="Destination" required error={errors.destination?.message} htmlFor="tr-destination">
                <Select id="tr-destination" invalid={!!errors.destination} {...form.register("destination")}>
                  <option value="">Select destination...</option>
                  <optgroup label="Countries">
                    {(countries.data ?? [])
                      .filter((c) => c.iso2 === "TZ" || !c.is_sourcing_origin)
                      .map((c) => (
                        <option key={c.id} value={`country:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                  {(zones.data ?? []).some((z) => z.status === "active") && (
                    <optgroup label="Zones">
                      {(zones.data ?? [])
                        .filter((z) => z.status === "active")
                        .map((z) => (
                          <option key={z.id} value={`zone:${z.id}`}>
                            {z.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <optgroup label="Tanzania cities">
                    {(tzCities.data ?? []).map((c) => (
                      <option key={c.id} value={`city:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </FormField>
              <FormField label="Shipping Method" required error={errors.method?.message} htmlFor="tr-method">
                <Select id="tr-method" invalid={!!errors.method} {...form.register("method")}>
                  <option value="">Select method...</option>
                  {(methods.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.status !== "active" ? " (inactive)" : ""}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Shipping Profile / Product" htmlFor="tr-profile">
                <Select id="tr-profile" {...form.register("profile")}>
                  <option value="">No profile (general rules only)</option>
                  {(profiles.data ?? [])
                    .filter((p) => p.status === "active")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </Select>
                <Input className="mt-2 uppercase" placeholder="Product SKU (optional)" aria-label="Product SKU" {...form.register("product_sku")} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Weight (KG)" error={errors.weight_kg?.message} htmlFor="tr-weight">
                  <Input id="tr-weight" inputMode="decimal" placeholder="e.g. 1.5" invalid={!!errors.weight_kg} {...form.register("weight_kg")} />
                </FormField>
                <FormField label="Quantity" error={errors.quantity?.message} htmlFor="tr-qty">
                  <Input id="tr-qty" inputMode="numeric" placeholder="e.g. 1" invalid={!!errors.quantity} {...form.register("quantity")} />
                </FormField>
              </div>
              {!manualCbm && (
                <div className="grid grid-cols-3 gap-2">
                  <FormField label="Length (cm)" htmlFor="tr-l">
                    <Input id="tr-l" inputMode="decimal" placeholder="30" invalid={!!errors.length_cm} {...form.register("length_cm")} />
                  </FormField>
                  <FormField label="Width (cm)" htmlFor="tr-w">
                    <Input id="tr-w" inputMode="decimal" placeholder="25" invalid={!!errors.width_cm} {...form.register("width_cm")} />
                  </FormField>
                  <FormField label="Height (cm)" htmlFor="tr-h">
                    <Input id="tr-h" inputMode="decimal" placeholder="15" invalid={!!errors.height_cm} {...form.register("height_cm")} />
                  </FormField>
                </div>
              )}
              {errors.height_cm && <p className="text-xs text-red-600 -mt-2">{errors.height_cm.message}</p>}
              {manualCbm ? (
                <FormField label="CBM (per item)" hint="Manual CBM input is enabled in Shipping Engine Settings" error={errors.cbm?.message} htmlFor="tr-cbm">
                  <Input id="tr-cbm" inputMode="decimal" className="font-mono" placeholder="e.g. 0.011" {...form.register("cbm")} />
                </FormField>
              ) : (
                <FormField label="CBM (auto-calculated)" hint="Length × Width × Height ÷ 1,000,000">
                  <Input
                    value={autoCbm === null ? "" : autoCbm.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                    placeholder="Enter dimensions"
                    disabled
                    readOnly
                    className="bg-gray-50 font-mono"
                    aria-label="CBM (auto-calculated)"
                  />
                </FormField>
              )}
              <Btn variant="primary" type="submit" icon={loading ? RefreshCw : FlaskConical} disabled={loading} className={loading ? "[&>svg]:animate-spin" : ""}>
                {loading ? "Calculating..." : "Calculate Shipping"}
              </Btn>
            </form>
          </SectionCard>
        </div>

        <div className="lg:col-span-3" aria-live="polite">
          {loading ? (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl h-full min-h-72 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <RefreshCw className="size-10 mx-auto mb-3 opacity-40 animate-spin" />
                <p className="font-medium">Calculating...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3" role="alert">
              <AlertCircle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">The engine could not calculate this shipment</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          ) : result ? (
            <RateResult result={result} />
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl h-full min-h-72 flex items-center justify-center p-6">
              <div className="text-center text-gray-400">
                <FlaskConical className="size-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Enter shipment details and click Calculate</p>
                <p className="text-sm mt-1">The engine will show you exactly which rule applies and why</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </EnginePage>
  );
}
