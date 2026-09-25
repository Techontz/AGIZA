"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import type { Route, Scope } from "@/lib/api/services/shipping-engine";
import { engine } from "@/lib/api/services/shipping-engine";

import { applyFieldErrors, useCities, useCountries, useEngineMutation, useMethodOptions, useZoneOptions } from "./hooks";
import { Btn, EngineModal, FormField, Select, Textarea, ToggleOption } from "./ui";

const schema = z.object({
  origin: z.string().min(1, "Select an origin"),
  destination: z.string().min(1, "Select a destination"),
  methods: z.array(z.number()).min(1, "Select at least one shipping method"),
  notes: z.string(),
  status: z.enum(["active", "inactive"]),
});
type Values = z.infer<typeof schema>;

const LOCAL_CATEGORIES = ["land", "local"];

/** Create / edit a directional route (design: CreateRouteForm). */
export function RouteForm({ open, onClose, route, defaultType = "local" }: {
  open: boolean;
  onClose: () => void;
  route?: Route | null;
  defaultType?: Scope;
}) {
  const [type, setType] = useState<Scope>(route?.type ?? defaultType);
  const countries = useCountries();
  const tz = countries.data?.find((c) => c.iso2 === "TZ");
  const tzCities = useCities(tz?.id);
  const zones = useZoneOptions();
  const methods = useMethodOptions();
  const [formError, setFormError] = useState<string | null>(null);

  const initial = (): Values => {
    if (!route) return { origin: "", destination: "", methods: [], notes: "", status: "active" };
    const origin = route.origin_city ? `city:${route.origin_city}` : `country:${route.origin_country}`;
    const destination = route.destination_zone
      ? `zone:${route.destination_zone}`
      : route.destination_city
        ? `city:${route.destination_city}`
        : `country:${route.destination_country}`;
    return { origin, destination, methods: route.methods, notes: route.notes, status: route.status };
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial() });

  useEffect(() => {
    if (open) {
      form.reset(initial());
      setType(route?.type ?? defaultType);
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id]);

  const origins = useMemo(() => {
    if (type === "local") return (tzCities.data ?? []).map((c) => ({ value: `city:${c.id}`, label: c.name }));
    return (countries.data ?? [])
      .filter((c) => c.is_sourcing_origin && c.iso2 !== "TZ")
      .map((c) => ({ value: `country:${c.id}`, label: c.name }));
  }, [type, tzCities.data, countries.data]);

  const zoneOptions = (zones.data ?? []).filter((z) => z.type === type && z.status !== "inactive");
  const sortedMethods = useMemo(() => {
    const rank = (c: string) => (LOCAL_CATEGORIES.includes(c) === (type === "local") ? 0 : 1);
    return [...(methods.data ?? [])]
      .filter((m) => m.status === "active" || form.getValues("methods").includes(m.id))
      .sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
  }, [methods.data, type, form]);

  const mutation = useEngineMutation(
    (payload: Record<string, unknown>) => (route ? engine.routes.update(route.id, payload) : engine.routes.create(payload)),
    { success: route ? "Route updated" : "Route created", onSuccess: onClose },
  );

  const submit = form.handleSubmit((v) => {
    setFormError(null);
    const [okind, oid] = v.origin.split(":");
    const [dkind, did] = v.destination.split(":");
    const payload: Record<string, unknown> = {
      origin_country: okind === "city" ? tz?.id : Number(oid),
      origin_city: okind === "city" ? Number(oid) : null,
      destination_country: dkind === "country" ? Number(did) : null,
      destination_city: dkind === "city" ? Number(did) : null,
      destination_zone: dkind === "zone" ? Number(did) : null,
      methods: v.methods,
      notes: v.notes,
      status: v.status,
    };
    mutation.mutate(payload, {
      onError: (err) => {
        const msg = applyFieldErrors(err, form.setError, ["methods", "notes", "status"]);
        setFormError(msg);
      },
    });
  });

  const { errors } = form.formState;
  const switchType = (t: Scope) => {
    if (route) return; // a route's type follows its origin/destination
    setType(t);
    form.setValue("origin", "");
    form.setValue("destination", "");
  };

  return (
    <EngineModal
      open={open}
      onClose={onClose}
      title={route ? `Edit Route — ${route.label}` : "Create Route"}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={submit} loading={mutation.isPending}>
            {route ? "Save Route" : "Create Route"}
          </Btn>
        </>
      }
    >
      {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <FormField label="Route Type" required>
        <div className="flex gap-3">
          {(["local", "international"] as const).map((t) => (
            <ToggleOption key={t} selected={type === t} onClick={() => switchType(t)} className="flex-1">
              {t === "local" ? "Local Delivery" : "International Shipping"}
            </ToggleOption>
          ))}
        </div>
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Origin" required error={errors.origin?.message} htmlFor="route-origin">
          <Select id="route-origin" invalid={!!errors.origin} {...form.register("origin")}>
            <option value="">Select origin...</option>
            {origins.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Destination"
          required
          error={errors.destination?.message}
          hint="Routes are directional — create separately for return"
          htmlFor="route-destination"
        >
          <Select id="route-destination" invalid={!!errors.destination} {...form.register("destination")}>
            <option value="">Select destination...</option>
            {zoneOptions.length > 0 && (
              <optgroup label="Zones">
                {zoneOptions.map((z) => (
                  <option key={z.id} value={`zone:${z.id}`}>
                    {z.name}
                  </option>
                ))}
              </optgroup>
            )}
            {type === "local" ? (
              <optgroup label="Specific city">
                {(tzCities.data ?? []).map((c) => (
                  <option key={c.id} value={`city:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ) : (
              <optgroup label="Country">
                {(countries.data ?? [])
                  .filter((c) => c.iso2 === "TZ" || !c.is_sourcing_origin)
                  .map((c) => (
                    <option key={c.id} value={`country:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </Select>
        </FormField>
      </div>
      <FormField label="Available Shipping Methods" required error={errors.methods?.message}>
        <Controller
          control={form.control}
          name="methods"
          render={({ field }) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sortedMethods.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600"
                    checked={field.value.includes(m.id)}
                    onChange={(e) =>
                      field.onChange(e.target.checked ? [...field.value, m.id] : field.value.filter((x) => x !== m.id))
                    }
                  />
                  {m.name}
                  {m.status !== "active" && <span className="text-xs text-gray-400">(inactive)</span>}
                </label>
              ))}
              {methods.data && sortedMethods.length === 0 && (
                <p className="text-sm text-gray-400">No shipping methods yet — add them under Shipping Methods.</p>
              )}
            </div>
          )}
        />
      </FormField>
      <FormField label="Notes">
        <Textarea rows={2} placeholder="Optional notes about this route..." {...form.register("notes")} />
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
