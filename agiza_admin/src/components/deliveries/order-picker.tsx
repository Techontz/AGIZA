"use client";

import { useQuery } from "@tanstack/react-query";
import { Package2, Search, X } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/form";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorText } from "@/lib/api/errors";
import {
  ordersApi,
  type CustomerRef,
  type EquipmentOrder,
  type ExpressOrder,
  type InternationalOrder,
} from "@/lib/api/services/orders";

export type OrderKind = "international" | "express" | "equipment";

/** An order chosen when creating a delivery or a return, with address hints. */
export interface PickedOrder {
  id: number;
  reference: string;
  kind: OrderKind;
  status_display: string;
  customer: CustomerRef;
  item_details: string;
  total_amount: string | null;
  address: string;
  city: { id: number; name: string } | null;
}

const KIND_LABEL: Record<OrderKind, string> = {
  international: "International",
  express: "Express",
  equipment: "Equipment",
};

function base(o: InternationalOrder | ExpressOrder | EquipmentOrder, kind: OrderKind) {
  return {
    id: o.id,
    reference: o.reference,
    kind,
    status_display: o.status_display,
    customer: o.customer,
    item_details: o.item_details,
    total_amount: o.total_amount,
  };
}
const fromInternational = (o: InternationalOrder): PickedOrder => ({ ...base(o, "international"), address: "", city: null });
const fromExpress = (o: ExpressOrder): PickedOrder => ({
  ...base(o, "express"),
  address: o.details.delivery_address,
  city: o.details.delivery_city,
});
const fromEquipment = (o: EquipmentOrder): PickedOrder => ({
  ...base(o, "equipment"),
  address: o.details.site_address,
  city: o.details.city,
});

async function searchOrders(search: string, kinds: OrderKind[]): Promise<PickedOrder[]> {
  const q = { search, page_size: 6 };
  const calls: Promise<PickedOrder[]>[] = kinds.map((k) =>
    k === "international"
      ? ordersApi.international.list(q).then((r) => r.results.map(fromInternational))
      : k === "express"
        ? ordersApi.express.list(q).then((r) => r.results.map(fromExpress))
        : ordersApi.equipment.list(q).then((r) => r.results.map(fromEquipment)),
  );
  const settled = await Promise.allSettled(calls);
  const ok = settled.filter((s): s is PromiseFulfilledResult<PickedOrder[]> => s.status === "fulfilled");
  if (ok.length === 0) {
    const first = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    throw first?.reason ?? new Error("Could not search orders.");
  }
  return ok.flatMap((s) => s.value);
}

/** Search orders by reference, customer or item (across the given order kinds). */
export function OrderPicker({
  value,
  onChange,
  kinds,
  error,
  id,
}: {
  value: PickedOrder | null;
  onChange: (o: PickedOrder | null) => void;
  kinds: OrderKind[];
  error?: string;
  id?: string;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const results = useQuery({
    queryKey: ["orders", "picker", kinds, debounced],
    queryFn: () => searchOrders(debounced, kinds),
    enabled: debounced.length >= 2 && !value,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{value.reference}</span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{KIND_LABEL[value.kind]}</span>
            <span className="text-xs text-gray-500">{value.status_display}</span>
          </div>
          <p className="text-sm text-gray-600 truncate">
            {value.customer.full_name} · {value.item_details}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1 rounded hover:bg-gray-200 flex-shrink-0" aria-label="Change order">
          <X className="size-4 text-gray-500" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          id={id}
          className="pl-9"
          placeholder="Search by order ID, customer or item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          invalid={Boolean(error)}
          autoComplete="off"
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {debounced.length >= 2 && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto" aria-live="polite">
          {results.isPending ? (
            <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
          ) : results.isError ? (
            <p className="px-3 py-2 text-sm text-red-600">{errorText(results.error)}</p>
          ) : results.data.length ? (
            results.data.map((o) => (
              <button
                key={`${o.kind}-${o.id}`}
                type="button"
                onClick={() => onChange(o)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2"
              >
                <Package2 className="size-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">{o.reference}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {KIND_LABEL[o.kind]} · {o.status_display}
                  </span>
                  <span className="block text-xs text-gray-600 truncate">
                    {o.customer.full_name} · {o.item_details}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">No orders match “{debounced}”.</p>
          )}
        </div>
      )}
    </div>
  );
}
