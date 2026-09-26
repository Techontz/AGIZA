"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, Edit, Globe, Lock, MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { useCities, useCountries } from "@/components/shipping-engine/hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Skeleton } from "@/components/ui/states";
import {
  catalogApi,
  catalogKeys,
  type EstimateRoute,
  type EstimateRouteInput,
  type OriginEstimate,
  type OriginEstimateInput,
  type ShipMethod,
  type StoreSettings,
  type StoreSettingsInput,
} from "@/lib/api/services/catalog";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

import { DeleteDialog, FormErrors, IconSwitch, useCatalogAccess, useCatalogMutation, type Errors } from "./shared";

const label = "block text-sm font-semibold text-gray-700 mb-2";
const dayInput = "w-20 px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500";
const smallSelect = "px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const toInt = (v: string) => (v === "" ? 0 : Math.max(0, Math.floor(Number(v)) || 0));

export function SettingsSection() {
  const { canManage } = useCatalogAccess();
  const settings = useQuery({ queryKey: catalogKeys.settings, queryFn: ({ signal }) => catalogApi.settings.get(signal) });

  if (settings.isError && !settings.data) {
    return <ErrorState message={(settings.error as Error).message} onRetry={() => settings.refetch()} />;
  }
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Store Settings</h2>
        {settings.data && <p className="text-xs text-gray-500">Last saved {formatDateTime(settings.data.updated_at)}</p>}
      </div>
      {!canManage && (
        <div className="mb-6 max-w-2xl flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
          <Lock className="size-4 flex-shrink-0" />
          Store settings can only be changed by users with Manage access to the E-commerce module.
        </div>
      )}
      {settings.data ? (
        <SettingsForm key={settings.data.updated_at} data={settings.data} canManage={canManage} />
      ) : (
        <div className="space-y-6 max-w-2xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const SETTINGS_FIELDS = [
  "store_name", "description", "location", "currency", "same_city_min_days", "same_city_max_days",
  "regional_min_days", "regional_max_days", "guest_checkout", "product_reviews",
] as const;

function SettingsForm({ data, canManage }: { data: StoreSettings; canManage: boolean }) {
  const [form, setForm] = useState<Required<StoreSettingsInput>>({
    store_name: data.store_name,
    description: data.description,
    location: data.location,
    currency: data.currency,
    same_city_min_days: data.same_city_min_days,
    same_city_max_days: data.same_city_max_days,
    regional_min_days: data.regional_min_days,
    regional_max_days: data.regional_max_days,
    guest_checkout: data.guest_checkout,
    product_reviews: data.product_reviews,
  });
  const [errors, setErrors] = useState<Errors>({});
  const cities = useCities();
  const set = <K extends keyof StoreSettingsInput>(k: K, v: Required<StoreSettingsInput>[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useCatalogMutation((body: StoreSettingsInput) => catalogApi.settings.update(body), { success: "Store settings saved", setErrors });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!form.store_name.trim()) local.store_name = "Enter the store name.";
    if (form.same_city_min_days > form.same_city_max_days) local.same_city_max_days = "Must be at least the minimum.";
    if (form.regional_min_days > form.regional_max_days) local.regional_max_days = "Must be at least the minimum.";
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({ ...form, store_name: form.store_name.trim() });
  };

  const ro = !canManage;
  const cityList = cities.data ?? [];
  const missingCity = form.location !== null && !cityList.some((c) => c.id === form.location);

  const rangeError = (a: string, b: string) => errors[a] ?? errors[b];

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl" noValidate>
      <FormErrors errors={errors} fields={SETTINGS_FIELDS} />
      <div>
        <label htmlFor="s-name" className={label}>Store Name</label>
        <input id="s-name" type="text" value={form.store_name} disabled={ro} maxLength={120} onChange={(e) => set("store_name", e.target.value)}
          aria-invalid={Boolean(errors.store_name) || undefined} className={inputClass} />
        {errors.store_name && <p className="text-xs text-red-600 mt-1">{errors.store_name}</p>}
      </div>
      <div>
        <label htmlFor="s-desc" className={label}>Store Description</label>
        <textarea id="s-desc" rows={3} value={form.description} disabled={ro} onChange={(e) => set("description", e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="s-location" className={label}>Store Location</label>
        <select id="s-location" value={form.location ?? ""} disabled={ro} onChange={(e) => set("location", e.target.value ? Number(e.target.value) : null)} className={inputClass}>
          <option value="">{cities.isPending ? "Loading cities…" : "Select a city"}</option>
          {missingCity && <option value={form.location ?? ""}>{data.location_name ?? "Current city"}</option>}
          {cityList.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {errors.location && <p className="text-xs text-red-600 mt-1">{errors.location}</p>}
      </div>
      <div>
        <label htmlFor="s-currency" className={label}>Currency</label>
        <select id="s-currency" value={form.currency} disabled={ro} onChange={(e) => set("currency", e.target.value)} className={inputClass}>
          <option value="TZS">TSh - Tanzanian Shilling</option>
          {form.currency !== "TZS" && <option value={form.currency}>{form.currency}</option>}
        </select>
      </div>

      {/* Estimated Delivery Setting */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="size-6 text-blue-600 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-gray-900">Estimated Delivery Settings</h3>
            <p className="text-sm text-gray-600">Configure delivery time estimates based on store location to destination city</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DayRange
              id="same-city"
              title="Same City Delivery"
              min={form.same_city_min_days}
              max={form.same_city_max_days}
              onMin={(v) => set("same_city_min_days", v)}
              onMax={(v) => set("same_city_max_days", v)}
              disabled={ro}
              error={rangeError("same_city_min_days", "same_city_max_days")}
            />
            <DayRange
              id="regional"
              title="Regional Delivery"
              min={form.regional_min_days}
              max={form.regional_max_days}
              onMin={(v) => set("regional_min_days", v)}
              onMax={(v) => set("regional_max_days", v)}
              disabled={ro}
              error={rangeError("regional_min_days", "regional_max_days")}
            />
          </div>

          <CustomRoutes canManage={canManage} />
          <OriginRules canManage={canManage} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-3 border-t border-gray-200">
        <div>
          <p className="font-semibold text-gray-900">Enable Guest Checkout</p>
          <p className="text-sm text-gray-600">Allow customers to checkout without creating an account</p>
        </div>
        <IconSwitch size="lg" checked={form.guest_checkout} onChange={(v) => set("guest_checkout", v)} disabled={ro} label="Enable Guest Checkout" />
      </div>
      <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-200">
        <div>
          <p className="font-semibold text-gray-900">Enable Product Reviews</p>
          <p className="text-sm text-gray-600">Let customers leave reviews on products</p>
        </div>
        <IconSwitch size="lg" checked={form.product_reviews} onChange={(v) => set("product_reviews", v)} disabled={ro} label="Enable Product Reviews" />
      </div>
      {canManage && (
        <Button type="submit" size="lg" loading={save.isPending}>
          Save Settings
        </Button>
      )}
    </form>
  );
}

function DayRange({
  id, title, min, max, onMin, onMax, disabled, error,
}: {
  id: string; title: string; min: number; max: number; onMin: (v: number) => void; onMax: (v: number) => void; disabled?: boolean; error?: string;
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-gray-700 mb-2">{title}</legend>
      <div className="flex items-center gap-2">
        <input id={`${id}-min`} type="number" min={0} value={min} disabled={disabled} onChange={(e) => onMin(toInt(e.target.value))} aria-label={`${title} minimum days`} className={dayInput} />
        <span className="text-sm text-gray-600">- </span>
        <input id={`${id}-max`} type="number" min={0} value={max} disabled={disabled} onChange={(e) => onMax(toInt(e.target.value))} aria-label={`${title} maximum days`}
          aria-invalid={Boolean(error) || undefined} className={cn(dayInput, error && "border-red-400")} />
        <span className="text-sm text-gray-700 font-medium">days</span>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </fieldset>
  );
}

/* ------------------------------------------------------ custom routes */

function CustomRoutes({ canManage }: { canManage: boolean }) {
  const routes = useQuery({ queryKey: catalogKeys.estimateRoutes, queryFn: ({ signal }) => catalogApi.estimateRoutes.list(signal) });
  const [editing, setEditing] = useState<EstimateRoute | "new" | null>(null);
  const [deleting, setDeleting] = useState<EstimateRoute | null>(null);

  return (
    <div className="space-y-2">
      <p className="block text-sm font-medium text-gray-700">Custom City-to-City Routes</p>
      {routes.isError && !routes.data ? (
        <div role="alert" className="bg-white rounded-lg p-3 border border-red-200 text-sm text-red-600">
          Couldn&apos;t load routes.{" "}
          <button type="button" className="font-medium underline" onClick={() => routes.refetch()}>Try again</button>
        </div>
      ) : routes.isPending ? (
        <Skeleton className="h-11 w-full" />
      ) : (
        <>
          {routes.data.length === 0 && editing !== "new" && (
            <p className="text-sm text-gray-500 bg-white rounded-lg p-3 border border-dashed border-gray-300">
              No custom routes. Same-city and regional estimates apply everywhere.
            </p>
          )}
          {routes.data.map((r) =>
            editing !== "new" && editing?.id === r.id ? (
              <RouteForm key={r.id} route={r} onDone={() => setEditing(null)} />
            ) : (
              <div key={r.id} className="bg-white rounded-lg p-3 border border-gray-300">
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="size-4 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-700">{r.from_city_name} → {r.to_city_name}:</span>
                  <span className="font-semibold text-gray-900">{r.min_days}-{r.max_days} days</span>
                  {canManage && (
                    <span className="ml-auto flex items-center gap-1">
                      <button type="button" onClick={() => setEditing(r)} className="p-1 text-gray-400 hover:text-blue-600" aria-label={`Edit route ${r.from_city_name} to ${r.to_city_name}`}>
                        <Edit className="size-4" />
                      </button>
                      <button type="button" onClick={() => setDeleting(r)} className="p-1 text-gray-400 hover:text-red-500" aria-label={`Delete route ${r.from_city_name} to ${r.to_city_name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ),
          )}
        </>
      )}
      {editing === "new" && <RouteForm route={null} onDone={() => setEditing(null)} />}
      {canManage && editing !== "new" && (
        <button type="button" onClick={() => setEditing("new")} className="w-full bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium">
          + Add Custom Route
        </button>
      )}
      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Route"
        name={deleting ? `${deleting.from_city_name} → ${deleting.to_city_name}` : ""}
        onDelete={() => catalogApi.estimateRoutes.remove(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function RouteForm({ route, onDone }: { route: EstimateRoute | null; onDone: () => void }) {
  const cities = useCities();
  const [form, setForm] = useState({
    from_city: route ? String(route.from_city) : "",
    to_city: route ? String(route.to_city) : "",
    min_days: route ? String(route.min_days) : "",
    max_days: route ? String(route.max_days) : "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const save = useCatalogMutation(
    (body: EstimateRouteInput) => (route ? catalogApi.estimateRoutes.update(route.id, body) : catalogApi.estimateRoutes.create(body)),
    { success: (r) => `Route ${r.from_city_name} → ${r.to_city_name} saved`, onSuccess: onDone, setErrors },
  );

  const submit = () => {
    const local: Errors = {};
    if (!form.from_city) local.from_city = "Choose a city.";
    if (!form.to_city) local.to_city = "Choose a city.";
    else if (form.to_city === form.from_city) local.to_city = "Choose a different city.";
    if (form.min_days === "") local.min_days = "Required.";
    if (form.max_days === "") local.max_days = "Required.";
    else if (toInt(form.min_days) > toInt(form.max_days)) local.max_days = "Must be at least the minimum.";
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({ from_city: Number(form.from_city), to_city: Number(form.to_city), min_days: toInt(form.min_days), max_days: toInt(form.max_days) });
  };

  const cityOptions = (cities.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>);
  const errList = Object.values(errors);

  return (
    <div
      className="bg-white rounded-lg p-3 border border-blue-300 space-y-2"
      role="group"
      aria-label={route ? "Edit custom route" : "New custom route"}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <MapPin className="size-4 text-gray-500" />
        <select value={form.from_city} onChange={(e) => setForm({ ...form, from_city: e.target.value })} aria-label="From city" aria-invalid={Boolean(errors.from_city) || undefined} className={smallSelect}>
          <option value="">From city…</option>
          {cityOptions}
        </select>
        <span className="text-gray-500">→</span>
        <select value={form.to_city} onChange={(e) => setForm({ ...form, to_city: e.target.value })} aria-label="To city" aria-invalid={Boolean(errors.to_city) || undefined} className={smallSelect}>
          <option value="">To city…</option>
          {cityOptions}
        </select>
        <input type="number" min={0} value={form.min_days} onChange={(e) => setForm({ ...form, min_days: e.target.value })} aria-label="Minimum days" placeholder="Min" className={cn(dayInput, "w-16 text-sm")} />
        <span className="text-gray-600">-</span>
        <input type="number" min={0} value={form.max_days} onChange={(e) => setForm({ ...form, max_days: e.target.value })} aria-label="Maximum days" placeholder="Max" className={cn(dayInput, "w-16 text-sm")} />
        <span className="text-gray-700 font-medium">days</span>
      </div>
      {errList.length > 0 && <p role="alert" className="text-xs text-red-600">{errList.join(" ")}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} loading={save.isPending}>{route ? "Save Route" : "Add Route"}</Button>
        <Button size="sm" variant="muted" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ origin rules */

const ORIGIN_FIELDS = ["country", "method", "min_days", "max_days"] as const;

function OriginRules({ canManage }: { canManage: boolean }) {
  const rules = useQuery({ queryKey: catalogKeys.originEstimates, queryFn: ({ signal }) => catalogApi.originEstimates.list(signal) });
  const [editing, setEditing] = useState<OriginEstimate | "new" | null>(null);

  return (
    <div className="pt-4 border-t border-blue-200">
      <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
        <Globe className="size-4" />
        Global Origin Rules
      </h4>
      {rules.isError && !rules.data ? (
        <div role="alert" className="bg-white rounded-lg p-3 border border-red-200 text-sm text-red-600">
          Couldn&apos;t load origin rules.{" "}
          <button type="button" className="font-medium underline" onClick={() => rules.refetch()}>Try again</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {rules.isPending
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            : rules.data.map((r) => {
                const body = (
                  <>
                    <p className="text-xs font-bold text-gray-400 uppercase">{r.country_name} {r.method === "air" ? "Air" : "Sea"}</p>
                    <p className="text-sm font-semibold text-gray-900">{r.min_days} - {r.max_days} Days</p>
                  </>
                );
                return canManage ? (
                  <button key={r.id} type="button" onClick={() => setEditing(r)} className="p-3 bg-white rounded-lg border border-blue-100 text-left hover:border-blue-400 transition-colors" aria-label={`Edit ${r.country_name} ${r.method} rule`}>
                    {body}
                  </button>
                ) : (
                  <div key={r.id} className="p-3 bg-white rounded-lg border border-blue-100">{body}</div>
                );
              })}
          {!rules.isPending && rules.data.length === 0 && !canManage && (
            <p className="col-span-2 text-sm text-gray-500">No origin rules configured.</p>
          )}
          {canManage && !rules.isPending && (
            <button type="button" onClick={() => setEditing("new")} className="p-3 rounded-lg border-2 border-dashed border-blue-200 text-blue-700 hover:border-blue-400 hover:bg-white transition-colors flex items-center justify-center gap-1.5 text-sm font-medium min-h-16">
              <Plus className="size-4" />
              Add Origin Rule
            </button>
          )}
        </div>
      )}
      {editing && <OriginRuleModal rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OriginRuleModal({ rule, onClose }: { rule: OriginEstimate | null; onClose: () => void }) {
  const countries = useCountries();
  const [form, setForm] = useState({
    country: rule ? String(rule.country) : "",
    method: (rule?.method ?? "air") as ShipMethod,
    min_days: rule ? String(rule.min_days) : "",
    max_days: rule ? String(rule.max_days) : "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useCatalogMutation(
    (body: OriginEstimateInput) => (rule ? catalogApi.originEstimates.update(rule.id, body) : catalogApi.originEstimates.create(body)),
    { success: (r) => `${r.country_name} ${r.method} rule saved`, onSuccess: onClose, setErrors },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!form.country) local.country = "Choose a country.";
    if (form.min_days === "") local.min_days = "Required.";
    if (form.max_days === "") local.max_days = "Required.";
    else if (toInt(form.min_days) > toInt(form.max_days)) local.max_days = "Must be at least the minimum.";
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({ country: Number(form.country), method: form.method, min_days: toInt(form.min_days), max_days: toInt(form.max_days) });
  };

  // Sourcing origins first, then the rest.
  const list = [...(countries.data ?? [])].sort((a, b) => Number(b.is_sourcing_origin) - Number(a.is_sourcing_origin) || a.display_name.localeCompare(b.display_name));

  return (
    <>
      <Modal
        open={!confirmDelete}
        onClose={onClose}
        title={rule ? "Edit Origin Rule" : "Add Origin Rule"}
        size="md"
        footer={
          <>
            <Button type="submit" form="origin-form" className="flex-1" loading={save.isPending}>
              {rule ? "Update Rule" : "Add Rule"}
            </Button>
            {rule && (
              <Button variant="outline" className="text-red-600" onClick={() => setConfirmDelete(true)} aria-label="Delete rule">
                <Trash2 className="size-4" />
              </Button>
            )}
            <Button variant="muted" onClick={onClose}>Cancel</Button>
          </>
        }
      >
        <form id="origin-form" onSubmit={submit} className="space-y-4" noValidate>
          <FormErrors errors={errors} fields={ORIGIN_FIELDS} />
          <Field label="Origin Country" required htmlFor="o-country" error={errors.country}>
            <Select id="o-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
              <option value="">{countries.isPending ? "Loading countries…" : "Select a country"}</option>
              {list.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </Select>
          </Field>
          <Field label="Method" htmlFor="o-method" error={errors.method}>
            <Select id="o-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as ShipMethod })}>
              <option value="air">Air</option>
              <option value="sea">Sea</option>
            </Select>
          </Field>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Transit Time</legend>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={365} value={form.min_days} onChange={(e) => setForm({ ...form, min_days: e.target.value })} aria-label="Minimum days" className={dayInput} />
              <span className="text-sm text-gray-600">-</span>
              <input type="number" min={0} max={365} value={form.max_days} onChange={(e) => setForm({ ...form, max_days: e.target.value })} aria-label="Maximum days" className={dayInput} />
              <span className="text-sm text-gray-700 font-medium">days</span>
            </div>
            {(errors.min_days || errors.max_days) && <p className="text-xs text-red-600 mt-1">{errors.min_days ?? errors.max_days}</p>}
          </fieldset>
        </form>
      </Modal>
      {rule && (
        <DeleteDialog
          open={confirmDelete}
          title="Delete Origin Rule"
          name={`${rule.country_name} ${rule.method === "air" ? "Air" : "Sea"}`}
          onDelete={() => catalogApi.originEstimates.remove(rule.id)}
          onDeleted={onClose}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
