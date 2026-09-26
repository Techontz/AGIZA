"use client";

import { useQuery } from "@tanstack/react-query";
import { Plane, Ship, Truck } from "lucide-react";
import { useId, useState } from "react";

import { Skeleton } from "@/components/ui/states";
import { LOOKUP_STALE, productKeys, productLookups, productsApi } from "@/lib/api/services/products";
import { cn } from "@/lib/cn";

/**
 * The Delivery Estimator plugin, driven by the store's own estimate rules
 * (GET catalog/delivery-estimate) instead of hard-coded numbers.
 */
export function DeliveryEstimator({
  originCountry,
  originLabel,
  defaultMethod,
  defaultSensitive,
  homeCountryId,
}: {
  originCountry: number | null;
  originLabel: string;
  defaultMethod: "air" | "sea";
  defaultSensitive: boolean;
  /** Tanzania: destinations are the customer's cities. */
  homeCountryId: number | null;
}) {
  const uid = useId();
  const [method, setMethod] = useState<"air" | "sea" | null>(null);
  const [sensitive, setSensitive] = useState<boolean | null>(null);
  const [city, setCity] = useState<string>("");
  const m = method ?? defaultMethod;
  const sens = sensitive ?? defaultSensitive;

  const cities = useQuery({
    queryKey: productKeys.lookup("cities", homeCountryId),
    queryFn: () => productLookups.cities(homeCountryId as number),
    enabled: homeCountryId !== null,
    staleTime: LOOKUP_STALE,
  });
  const destination = city || String(cities.data?.find((c) => c.name === "Dar es Salaam")?.id ?? cities.data?.[0]?.id ?? "");
  const destinationName = cities.data?.find((c) => String(c.id) === destination)?.name ?? "—";

  const query = {
    origin_country: originCountry ?? undefined,
    destination_city: destination ? Number(destination) : undefined,
    method: m,
    sensitive: sens,
  };
  const estimate = useQuery({
    queryKey: productKeys.estimate(query),
    queryFn: () => productsApi.deliveryEstimate(query),
    enabled: Boolean(destination),
    staleTime: 60_000,
  });
  const e = estimate.data;

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Truck className="size-5 text-blue-600" />
          <h4 className="font-bold text-gray-900">Delivery Estimator</h4>
        </div>
        <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded-full uppercase">Plugin Active</span>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-gray-500" htmlFor={`${uid}-dest`}>
            Destination
            <select
              id={`${uid}-dest`}
              value={destination}
              onChange={(ev) => setCity(ev.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(cities.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs text-gray-500">
            Method
            <div className="mt-1 flex rounded-lg border border-gray-300 overflow-hidden" role="radiogroup" aria-label="Shipping method">
              {(["air", "sea"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={m === x}
                  onClick={() => setMethod(x)}
                  className={cn("flex-1 py-1.5 text-sm font-medium flex items-center justify-center gap-1", m === x ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50")}
                >
                  {x === "air" ? <Plane className="size-3.5" /> : <Ship className="size-3.5" />}
                  {x === "air" ? "Air" : "Sea"}
                </button>
              ))}
            </div>
          </div>
          <label className="text-xs text-gray-500 flex items-end gap-2 pb-1.5 cursor-pointer">
            <input type="checkbox" checked={sens} onChange={(ev) => setSensitive(ev.target.checked)} className="rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">Sensitive goods</span>
          </label>
        </div>

        <div className="flex justify-between items-center text-sm gap-2">
          <span className="text-gray-500">Route:</span>
          <span className="font-medium text-gray-900 text-right">
            {originLabel} → {destinationName}
          </span>
        </div>

        <div className="pt-3 border-t border-blue-100">
          <p className="text-xs text-blue-600 font-medium mb-1 uppercase tracking-wider text-center">Estimated Arrival</p>
          <div className="text-center min-h-10 flex items-center justify-center" aria-live="polite">
            {estimate.isPending && Boolean(destination) ? (
              <Skeleton className="h-9 w-32" />
            ) : estimate.isError ? (
              <span className="text-sm text-red-600">Couldn&apos;t load the estimate.</span>
            ) : e && e.available ? (
              <span>
                <span className="text-3xl font-black text-blue-600">
                  {e.min_days}-{e.max_days}
                </span>
                <span className="ml-1 text-lg font-bold text-blue-600">DAYS</span>
              </span>
            ) : (
              <span className="text-sm text-gray-500">{e?.message ?? "Choose a destination."}</span>
            )}
          </div>
          {e?.available && e.basis && <p className="text-xs text-gray-500 text-center mt-1">Based on: {e.basis}</p>}
        </div>

        <p className="text-[10px] text-gray-400 text-center italic mt-2">*Estimates include clearing and processing time.</p>
      </div>
    </div>
  );
}
