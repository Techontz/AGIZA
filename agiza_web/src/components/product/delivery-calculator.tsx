"use client";

/**
 * "Calculate delivery" on a product page: pick a city and see what delivering this item costs
 * with each method. Priced by the Shipping Engine on the server, exactly as checkout prices it
 * (imported items: shipping to Tanzania, then delivery to the city).
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Calculator, Plane, Truck } from "lucide-react";
import { useEffect, useState } from "react";

import { errorMessage } from "@/lib/api/client";
import { shopApi } from "@/lib/api/endpoints";
import type { ShippingOption } from "@/lib/api/types";
import { isFree, money } from "@/lib/format";

import { Field, Select } from "../ui/field";
import { Notice, Skeleton } from "../ui/states";

const CITY_KEY = "agiza.delivery-city";

function readCity(): number | null {
  try {
    const value = Number(window.localStorage.getItem(CITY_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function OptionList({ title, icon: Icon, options }: { title: string; icon: typeof Truck; options: ShippingOption[] }) {
  const available = options.filter((o) => o.available);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Icon className="size-4 text-brand" aria-hidden /> {title}
      </p>
      {available.length ? (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {available.map((o) => (
            <li key={o.method_id} className="flex items-center justify-between gap-3 px-3 py-2 text-[14px]">
              <span className="min-w-0">
                <span className="block text-ink">{o.name}</span>
                {o.estimated_delivery ? <span className="block text-[12px] text-muted">{o.estimated_delivery}</span> : null}
              </span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">{isFree(o.cost) ? "Free" : money(o.cost, o.currency)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">{options.find((o) => o.message)?.message ?? "Not available for this city yet. Contact AGIZA for a quote."}</p>
      )}
    </div>
  );
}

export function DeliveryCalculator({ variantId, quantity }: { variantId: number; quantity: number }) {
  const [city, setCity] = useState<number | null>(null);
  useEffect(() => setCity(readCity()), []);
  const cities = useQuery({ queryKey: ["cities"], queryFn: shopApi.cities, staleTime: 3_600_000 });
  const estimate = useQuery({
    queryKey: ["delivery-estimate", variantId, city, quantity],
    queryFn: () => shopApi.deliveryEstimate(variantId, city!, quantity),
    enabled: city !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const choose = (value: number) => {
    setCity(value);
    try {
      window.localStorage.setItem(CITY_KEY, String(value));
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  };
  const data = estimate.data;

  return (
    <section className="rounded-md border border-line bg-canvas p-4" aria-labelledby="delivery-calc">
      <h2 id="delivery-calc" className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Calculator className="size-4" aria-hidden /> Calculate delivery
      </h2>
      <Field label="Deliver to" htmlFor="calc-city">
        <Select id="calc-city" value={city ?? ""} onChange={(e) => choose(Number(e.target.value))}>
          <option value="" disabled>
            {cities.isLoading ? "Loading cities…" : "Choose your city"}
          </option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {city !== null ? (
        <div className="mt-3 space-y-3" aria-live="polite">
          {estimate.isLoading ? <Skeleton className="h-20" /> : null}
          {estimate.isError ? <Notice tone="danger">{errorMessage(estimate.error)}</Notice> : null}
          {data ? (
            <>
              {data.imported ? (
                <OptionList title={`Shipping from ${data.ships_from ?? "abroad"} to ${data.hub ?? "Tanzania"}`} icon={Plane} options={data.import_options} />
              ) : null}
              <OptionList title={data.imported ? "Then delivery to your city" : "Delivery options"} icon={Truck} options={data.shipping_options} />
              {data.customs ? (
                <div className="text-[13px]">
                  {data.customs.lines.map((line) => (
                    <p key={`${line.kind}-${line.name}`} className="flex justify-between gap-3">
                      <span className="text-ink">{line.treatment === "estimate" ? `${line.name} (estimate)` : line.name}</span>
                      <span className="font-semibold text-ink tabular-nums">{money(line.amount, data.currency)}</span>
                    </p>
                  ))}
                  <p className="mt-1 text-[12px] text-muted">{data.customs.note}</p>
                </div>
              ) : null}
              <p className="text-[12px] text-muted">
                For {quantity} item{quantity === 1 ? "" : "s"}. Final cost is confirmed at checkout for everything in your cart.
                {data.prepayment_required ? " Imported items are paid when you order." : ""}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
