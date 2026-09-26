"use client";

import { useQuery } from "@tanstack/react-query";
import { Package, Search, X } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/form";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import { inventoryApi, inventoryKeys, type VariantOption } from "@/lib/api/services/warehouse";
import { formatTSh } from "@/lib/format";

/**
 * Search sellable catalogue variants by product name or SKU. Shows price and
 * total available stock. With `value`, renders the chosen variant instead.
 */
export function VariantSearch({
  id,
  value,
  onSelect,
  onClear,
  exclude = [],
  error,
  placeholder = "Search product by name or SKU...",
}: {
  id?: string;
  value?: VariantOption | null;
  onSelect: (v: VariantOption) => void;
  onClear?: () => void;
  exclude?: number[];
  error?: string;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search.trim(), 250);
  const results = useQuery({
    queryKey: inventoryKeys.variants(term),
    queryFn: () => inventoryApi.variants(term),
    enabled: term.length >= 2 && !value,
    staleTime: 15_000,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{value.name}</p>
          <p className="text-xs text-gray-500">
            <span className="font-mono">{value.sku}</span> · {formatTSh(value.price)} · {value.available} available
          </p>
        </div>
        {onClear && (
          <button type="button" onClick={onClear} className="p-1 rounded hover:bg-gray-200" aria-label="Change product">
            <X className="size-4 text-gray-500" />
          </button>
        )}
      </div>
    );
  }

  const rows = (results.data ?? []).filter((v) => !exclude.includes(v.id));
  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          id={id}
          type="search"
          className="pl-9"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
          invalid={Boolean(error)}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {term.length >= 2 && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto bg-white">
          {results.isPending ? (
            <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
          ) : results.isError ? (
            <p className="px-3 py-2 text-sm text-red-600" role="alert">
              {errorText(results.error)}
            </p>
          ) : rows.length ? (
            rows.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  onSelect(v);
                  setSearch("");
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">{v.name}</span>
                  <span className="block text-xs text-gray-500 font-mono">{v.sku}</span>
                </span>
                <span className="text-right flex-shrink-0">
                  <span className="block text-sm font-semibold text-gray-900">{formatTSh(v.price)}</span>
                  <span className={cn("block text-xs", v.available > 0 ? "text-green-700" : "text-red-600")}>
                    {v.available > 0 ? `${v.available} available` : "Out of stock"}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
              <Package className="size-4 text-gray-400" /> No active products match “{term}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
