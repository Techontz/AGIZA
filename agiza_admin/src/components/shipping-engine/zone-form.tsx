"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { engine, type Zone, type ZoneDestination } from "@/lib/api/services/shipping-engine";

import { applyFieldErrors, useCities, useCountries, useEngineMutation, useRegions, useZoneOptions } from "./hooks";
import { Btn, EngineModal, FormField, Input, Select, Textarea } from "./ui";

const schema = z.object({
  name: z.string().trim().min(1, "Zone name is required").max(120),
  type: z.enum(["local", "international"]),
  description: z.string(),
  status: z.enum(["active", "inactive", "draft"]),
});
type Values = z.infer<typeof schema>;
type Dest = { kind: ZoneDestination["kind"]; ref_id: number; name: string };
const key = (d: { kind: string; ref_id: number }) => `${d.kind}:${d.ref_id}`;

/** Create / edit a shipping zone (design: CreateZoneForm). */
export function ZoneForm({ open, onClose, zone }: { open: boolean; onClose: () => void; zone?: Zone | null }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", type: "local", description: "", status: "active" },
  });
  const [selected, setSelected] = useState<Dest[]>([]);
  const [filter, setFilter] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const type = useWatch({ control: form.control, name: "type" });

  useEffect(() => {
    if (!open) return;
    form.reset(
      zone
        ? { name: zone.name, type: zone.type, description: zone.description, status: zone.status }
        : { name: "", type: "local", description: "", status: "active" },
    );
    setSelected(zone ? zone.destinations.map((d) => ({ kind: d.kind, ref_id: d.ref_id, name: d.name ?? "" })) : []);
    setFilter("");
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zone?.id]);

  const countries = useCountries();
  const tz = countries.data?.find((c) => c.iso2 === "TZ");
  const cities = useCities(tz?.id);
  const regions = useRegions(tz?.id);
  const zones = useZoneOptions();

  // Destinations already used by other zones (a place belongs to one zone).
  const taken = useMemo(() => {
    const map = new Map<string, string>();
    for (const z of zones.data ?? []) {
      if (z.id === zone?.id) continue;
      for (const d of z.destinations) map.set(key(d), z.name);
    }
    return map;
  }, [zones.data, zone?.id]);

  const options: { group: string; items: Dest[] }[] = useMemo(() => {
    if (type === "international") {
      return [
        {
          group: "Countries",
          items: (countries.data ?? []).filter((c) => c.iso2 !== "TZ").map((c) => ({ kind: "country", ref_id: c.id, name: c.name })),
        },
      ];
    }
    return [
      { group: "Cities", items: (cities.data ?? []).map((c) => ({ kind: "city", ref_id: c.id, name: c.name })) },
      { group: "Regions", items: (regions.data ?? []).map((r) => ({ kind: "region", ref_id: r.id, name: `${r.name} (region)` })) },
    ];
  }, [type, countries.data, cities.data, regions.data]);

  const isSelected = (d: Dest) => selected.some((s) => key(s) === key(d));
  const toggle = (d: Dest) =>
    setSelected((prev) => (prev.some((s) => key(s) === key(d)) ? prev.filter((s) => key(s) !== key(d)) : [...prev, d]));

  const mutation = useEngineMutation(
    (payload: Record<string, unknown>) => (zone ? engine.zones.update(zone.id, payload) : engine.zones.create(payload)),
    { success: zone ? "Zone updated" : "Zone created", onSuccess: onClose },
  );

  const submit = form.handleSubmit((v) => {
    setFormError(null);
    if (selected.length === 0) {
      setFormError("Add at least one destination.");
      return;
    }
    mutation.mutate(
      { ...v, destinations: selected.map(({ kind, ref_id }) => ({ kind, ref_id })) },
      { onError: (err) => setFormError(applyFieldErrors(err, form.setError, ["name", "type", "description", "status"])) },
    );
  });

  const { errors } = form.formState;
  const needle = filter.trim().toLowerCase();

  return (
    <EngineModal
      open={open}
      onClose={onClose}
      title={zone ? `Edit Zone — ${zone.name}` : "Create Shipping Zone"}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" onClick={submit} loading={mutation.isPending}>
            {zone ? "Save Zone" : "Create Zone"}
          </Btn>
        </>
      }
    >
      {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
      <FormField label="Zone Name" required error={errors.name?.message} htmlFor="zone-name">
        <Input id="zone-name" placeholder="e.g. Zone C — Long Distance" invalid={!!errors.name} {...form.register("name")} />
      </FormField>
      <FormField label="Zone Type" required>
        <Select
          {...form.register("type", {
            onChange: () => setSelected([]),
          })}
          disabled={Boolean(zone && zone.routes_count > 0)}
        >
          <option value="local">Local</option>
          <option value="international">International</option>
        </Select>
      </FormField>
      <FormField label="Description">
        <Textarea rows={2} placeholder="Describe what this zone covers..." {...form.register("description")} />
      </FormField>
      <FormField label="Add Destinations" required hint="Select cities, regions, or destinations included in this zone">
        <div className="border border-gray-200 rounded-lg">
          <div className="relative border-b border-gray-100">
            <Search className="size-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter destinations..."
              aria-label="Filter destinations"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-t-lg focus:outline-none"
            />
          </div>
          <div className="p-3 max-h-48 overflow-y-auto space-y-3">
            {options.map(({ group, items }) => {
              const visible = items.filter((d) => !needle || d.name.toLowerCase().includes(needle));
              if (visible.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group}</p>
                  <div className="space-y-2">
                    {visible.map((d) => {
                      const owner = taken.get(key(d));
                      return (
                        <label
                          key={key(d)}
                          className={`flex items-center gap-2 text-sm ${owner ? "text-gray-400 cursor-not-allowed" : "text-gray-700 cursor-pointer hover:text-gray-900"}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected(d)}
                            disabled={Boolean(owner)}
                            onChange={() => toggle(d)}
                            className="rounded border-gray-300 text-blue-600"
                          />
                          {d.name}
                          {owner && <span className="text-xs">— in {owner}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FormField>
      {selected.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Selected ({selected.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((d) => (
              <span key={key(d)} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                {d.name}
                <button type="button" onClick={() => toggle(d)} aria-label={`Remove ${d.name}`}>
                  <XCircle className="size-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <FormField label="Status" required>
        <Select {...form.register("status")}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="draft">Draft</option>
        </Select>
      </FormField>
    </EngineModal>
  );
}
