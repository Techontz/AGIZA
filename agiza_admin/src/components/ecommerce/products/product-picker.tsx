"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { useId, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { productKeys, productsApi, type ProductRelationRef } from "@/lib/api/services/products";
import { formatTSh } from "@/lib/format";

import { Chip } from "./editor-ui";

/** Chips of chosen products plus a searchable "Add …" picker (catalog/products?search=). */
export function ProductPicker({
  value,
  onChange,
  addLabel,
  excludeId,
  disabled,
  error,
}: {
  value: ProductRelationRef[];
  onChange: (next: ProductRelationRef[]) => void;
  addLabel: string;
  /** The product being edited (can't relate to itself). */
  excludeId?: number;
  disabled?: boolean;
  error?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term.trim(), 300);
  const results = useQuery({
    queryKey: productKeys.search(debounced),
    queryFn: ({ signal }) => productsApi.search(debounced, signal),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });
  const chosen = new Set(value.map((p) => p.id));
  const options = (results.data ?? []).filter((p) => p.id !== excludeId && !chosen.has(p.id));

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map((p) => (
            <Chip key={p.id} label={p.name} onRemove={disabled ? undefined : () => onChange(value.filter((x) => x.id !== p.id))}>
              {p.name}
            </Chip>
          ))}
        </div>
      )}
      {open ? (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-gray-400" />
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-label={addLabel}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                setTerm("");
              }
            }}
            placeholder="Search products by name or SKU…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm max-h-56 overflow-y-auto" id={listId} role="listbox">
            {debounced.length < 2 ? (
              <p className="px-3 py-2 text-xs text-gray-400">Type at least 2 characters.</p>
            ) : results.isFetching && !results.data ? (
              <p className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </p>
            ) : results.isError ? (
              <p className="px-3 py-2 text-xs text-red-600">Couldn&apos;t search products.</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No matching products.</p>
            ) : (
              options.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onChange([...value, { id: p.id, name: p.name, sku: p.sku }]);
                    setTerm("");
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-800 truncate">{p.name}</span>
                    <span className="block text-xs text-gray-400 font-mono">{p.sku}</span>
                  </span>
                  <span className="text-xs text-blue-600 font-semibold whitespace-nowrap">{formatTSh(p.price)}</span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setTerm("");
            }}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            Done
          </button>
        </div>
      ) : (
        !disabled && (
          <button type="button" onClick={() => setOpen(true)} className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:text-blue-800">
            <Plus className="size-4" />
            {addLabel}
          </button>
        )
      )}
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
