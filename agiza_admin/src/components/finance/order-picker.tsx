"use client";

import { useQuery } from "@tanstack/react-query";
import { Package2, Search, X } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/form";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorText } from "@/lib/api/errors";
import { financeApi, type OrderPayment } from "@/lib/api/services/finance";
import { formatTSh } from "@/lib/format";

/** Search orders (Finance view: totals and balance) by reference, customer or item. */
export function FinanceOrderPicker({
  value,
  onChange,
  dueOnly,
  error,
  id,
}: {
  value: OrderPayment | null;
  onChange: (o: OrderPayment | null) => void;
  /** Only orders with a balance left to pay. */
  dueOnly?: boolean;
  error?: string;
  id?: string;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const results = useQuery({
    queryKey: ["finance", "order-picker", dueOnly ?? false, debounced],
    queryFn: () => financeApi.orderPayments.list({ search: debounced, page_size: 8, payment: dueOnly ? "due" : undefined }),
    enabled: debounced.length >= 2 && !value,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">{value.reference}</span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{value.order_type_display}</span>
            <span className="text-xs text-gray-500">{value.status_display}</span>
          </div>
          <p className="text-sm text-gray-600 truncate">
            {value.customer.full_name} · {value.item_details}
          </p>
          <p className="text-xs text-gray-500">
            Total {formatTSh(value.figures.total)} · Due {formatTSh(value.figures.due)}
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
      {debounced.length < 2 ? (
        <p className="text-xs text-gray-500 mt-1">Type at least 2 characters.</p>
      ) : (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto" aria-live="polite">
          {results.isPending ? (
            <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
          ) : results.isError ? (
            <p className="px-3 py-2 text-sm text-red-600">{errorText(results.error)}</p>
          ) : results.data.results.length ? (
            results.data.results.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange(o)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2"
              >
                <Package2 className="size-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-gray-900">{o.reference}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {o.order_type_display} · {o.status_display}
                  </span>
                  <span className="block text-xs text-gray-600 truncate">
                    {o.customer.full_name} · {o.item_details}
                  </span>
                  <span className="block text-xs text-gray-500">
                    Total {formatTSh(o.figures.total)} · Due {formatTSh(o.figures.due)}
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
