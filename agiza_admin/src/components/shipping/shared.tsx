"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCallback, useState } from "react";

import { useApiMutation } from "@/hooks/use-api-mutation";
import { can, useMe } from "@/hooks/use-me";
import { api } from "@/lib/api/client";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/query-keys";
import { locationsService } from "@/lib/api/services/locations";
import { orderKeys } from "@/lib/api/services/orders";
import { engine, seKeys } from "@/lib/api/services/shipping-engine";
import {
  shippingApi,
  shippingKeys,
  type CargoType,
  type MethodType,
  type ShipmentAlert,
  type ShipmentStatus,
} from "@/lib/api/services/shipping";
import type { Country } from "@/lib/api/types";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------- badges */

const STATUS_STYLE: Record<ShipmentStatus, string> = {
  created: "bg-purple-100 text-purple-800",
  booked: "bg-indigo-100 text-indigo-800",
  loaded: "bg-cyan-100 text-cyan-800",
  export_cleared: "bg-green-100 text-green-800",
  shipping_to_destination: "bg-yellow-100 text-yellow-800",
  clearance: "bg-orange-100 text-orange-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export const STATUS_OPTIONS: [ShipmentStatus, string][] = [
  ["created", "Created"],
  ["booked", "Booked"],
  ["loaded", "Loaded"],
  ["export_cleared", "Export Cleared"],
  ["shipping_to_destination", "In Transit"],
  ["clearance", "Clearance"],
  ["completed", "Ready for collection"],
  ["cancelled", "Cancelled"],
];

/** UI label of a shipment status: a completed shipment's goods are ready for collection. */
export function shipmentStatusLabel(status: ShipmentStatus, fallback?: string): string {
  return STATUS_OPTIONS.find(([v]) => v === status)?.[1] ?? fallback ?? status;
}

export const ALERT_OPTIONS: [Exclude<ShipmentAlert, "">, string][] = [
  ["customs_hold", "Customs Hold"],
  ["document_missing", "Document Missing"],
  ["carrier_delay", "Carrier Delay"],
];

export const CARGO_TYPE_OPTIONS: [CargoType, string][] = [
  ["standard", "Standard"],
  ["electronic_battery", "Electronic w/ Battery"],
  ["bulk", "Bulk"],
  ["machinery", "Machinery"],
  ["fragile", "Fragile"],
];

const CARGO_STYLE: Record<CargoType, string> = {
  standard: "bg-gray-100 text-gray-800",
  electronic_battery: "bg-yellow-100 text-yellow-800",
  bulk: "bg-blue-100 text-blue-800",
  machinery: "bg-purple-100 text-purple-800",
  fragile: "bg-red-100 text-red-800",
};

export const METHOD_LABEL: Record<MethodType, string> = { "air-cargo": "Air Cargo", sea: "Sea Cargo", road: "Road" };

const pill = "inline-flex w-fit items-center gap-1 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap";

export function ShipmentStatusBadge({ status, label }: { status: ShipmentStatus; label: string }) {
  return <span className={cn(pill, STATUS_STYLE[status])}>{status === "completed" ? shipmentStatusLabel(status) : label}</span>;
}

export function AlertBadge({ alert, label }: { alert: ShipmentAlert; label: string }) {
  if (!alert) {
    return (
      <span className={cn(pill, "bg-green-100 text-green-800")}>
        <CheckCircle2 className="size-3" />
        All Good
      </span>
    );
  }
  return (
    <span className={cn(pill, "bg-red-100 text-red-800")}>
      <AlertTriangle className="size-3" />
      {label}
    </span>
  );
}

export function CargoTypeBadge({ type, label }: { type: CargoType; label: string }) {
  return <span className={cn("px-2 py-1 rounded text-xs font-medium whitespace-nowrap", CARGO_STYLE[type])}>{label}</span>;
}

/* ------------------------------------------------------------- formatting */

/** "150.000" → "150", "2.5000" → "2.5"; null → "—". */
export function num(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Today in the browser's timezone as YYYY-MM-DD (for date inputs). */
export function isoToday(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** `<input type="datetime-local">` value → ISO string (or undefined when empty). */
export function localToIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

/* ---------------------------------------------------------------- access */

export function useShippingAccess() {
  const { data: me } = useMe();
  return { canEdit: can(me, "shipping", "edit") };
}

/* ------------------------------------------------------------- mutations */

/** Workflow call: refresh shipping (and order) queries, toast the outcome. */
export function useShippingMutation<V, R = unknown>(
  fn: (vars: V) => Promise<R>,
  opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; onError?: (e: unknown) => void } = {},
) {
  return useApiMutation(fn, { invalidate: [shippingKeys.all, orderKeys.all], ...opts });
}

/** Inline API errors for a form: field errors by name, anything else under "_". */
export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onError = useCallback((err: unknown) => {
    const fe = fieldErrors(err);
    setErrors(Object.keys(fe).length ? fe : { _: errorText(err) });
  }, []);
  const reset = useCallback(() => setErrors({}), []);
  return { errors, onError, reset };
}

/** Red box listing errors not tied to a visible field. */
export function FormErrorBox({ errors, fields }: { errors: Record<string, string>; fields: string[] }) {
  const rest = Object.entries(errors).filter(([k]) => !fields.includes(k));
  if (!rest.length) return null;
  return (
    <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 space-y-1">
      {rest.map(([k, v]) => (
        <p key={k}>{v}</p>
      ))}
    </div>
  );
}

/* ----------------------------------------------------- reference options */

export function useCarriers() {
  return useQuery({ queryKey: seKeys.list("carriers", { all: true }), queryFn: () => engine.carriers.all(), staleTime: 5 * 60_000 });
}

export function useMethods() {
  return useQuery({ queryKey: seKeys.list("methods", { all: true }), queryFn: () => engine.methods.all(), staleTime: 5 * 60_000 });
}

export function useOriginCountries() {
  return useQuery({
    queryKey: queryKeys.countries({ is_sourcing_origin: true }),
    queryFn: () => locationsService.countries({ is_sourcing_origin: true }),
    staleTime: 10 * 60_000,
  });
}

/** Destination cities in Tanzania. */
export function useTanzaniaCities(enabled = true) {
  const tz = useQuery({
    queryKey: queryKeys.countries({ iso2: "TZ" }),
    queryFn: () => api.get<Country[]>("countries", { iso2: "TZ" }),
    staleTime: 10 * 60_000,
    enabled,
  });
  const countryId = tz.data?.[0]?.id;
  const cities = useQuery({
    queryKey: queryKeys.cities({ country: countryId }),
    queryFn: () => locationsService.cities({ country: countryId }),
    enabled: enabled && Boolean(countryId),
    staleTime: 10 * 60_000,
  });
  return { data: cities.data, isPending: tz.isPending || cities.isPending, isError: tz.isError || cities.isError };
}

export function useConsolidationWarehouses(enabled = true) {
  return useQuery({ queryKey: shippingKeys.warehouses, queryFn: () => shippingApi.warehouses(), staleTime: 5 * 60_000, enabled });
}

/** "Loading…" / "Couldn't load" placeholder option for reference selects. */
export function placeholderOption(q: { isPending: boolean; isError: boolean }, label: string) {
  if (q.isError) return "Couldn't load options";
  if (q.isPending) return "Loading…";
  return label;
}
