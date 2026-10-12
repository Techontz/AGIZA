"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListOrdered, Pin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { catalogApi, catalogKeys, type Category } from "@/lib/api/services/catalog";

import { useCatalogAccess, useCatalogMutation } from "./shared";
import { OrderedProductPicker, type PickedProduct } from "./website-homepage-section";

const MAX = 100;

/** Website Product Order: products pinned to the top of the shop, and the order of categories. */
export function ShopOrderSection() {
  return (
    <div className="space-y-6">
      <PinnedProducts />
      <CategoryOrder />
    </div>
  );
}

function PinnedProducts() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.shopOrder, queryFn: ({ signal }) => catalogApi.shopOrder.list(signal) });
  const [picks, setPicks] = useState<PickedProduct[] | null>(null);

  // Start from the saved list; edits stay local until "Save order".
  useEffect(() => {
    if (list.data && picks === null) setPicks(list.data.map(({ id, name, sku, status }) => ({ id, name, sku, status })));
  }, [list.data, picks]);

  const dirty = picks !== null && (list.data ?? []).map((p) => p.id).join(",") !== picks.map((p) => p.id).join(",");
  const save = useCatalogMutation((ids: number[]) => catalogApi.shopOrder.save(ids), {
    success: "Website product order saved",
    onSuccess: (rows) => setPicks(rows.map(({ id, name, sku, status }) => ({ id, name, sku, status }))),
  });

  if (list.isError && !list.data) return <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />;

  return (
    <Card className="p-6 shadow-none space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <Pin className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Products shown first</h2>
            <p className="text-sm text-gray-600 max-w-2xl">
              These products appear at the top of the website shop and of their category pages, in this order (number 1
              first). Use it for products you want to sell quickly. All other products follow, newest first.
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="outline" onClick={() => setPicks(null)} disabled={save.isPending}>
                Discard changes
              </Button>
            )}
            <Button onClick={() => picks && save.mutate(picks.map((p) => p.id))} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save order"}
            </Button>
          </div>
        )}
      </div>

      {picks === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : canEdit ? (
        <OrderedProductPicker value={picks} onChange={setPicks} max={MAX} />
      ) : picks.length ? (
        <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {picks.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-5 text-right text-xs font-semibold text-gray-400">{i + 1}</span>
              <span className="font-medium text-gray-800">{p.name}</span>
              <span className="font-mono text-xs text-gray-400">{p.sku}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-500">No products pinned yet: the shop shows the newest products first.</p>
      )}

      {dirty && <p className="text-xs text-amber-700">You have unsaved changes. Click &quot;Save order&quot; to publish them.</p>}
    </Card>
  );
}

function CategoryOrder() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.categories, queryFn: ({ signal }) => catalogApi.categories.list(signal) });
  const [parent, setParent] = useState("");
  const all = useMemo(() => list.data ?? [], [list.data]);
  const mains = all.filter((c) => c.parent === null);
  const level = all
    .filter((c) => (parent ? c.parent === Number(parent) : c.parent === null))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const reorder = useCatalogMutation((ids: number[]) => catalogApi.categories.reorder(ids), { success: "Category order saved" });

  const move = (rows: Category[], index: number, delta: -1 | 1) => {
    const ids = rows.map((c) => c.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <Card className="p-6 shadow-none space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <ListOrdered className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Category order</h2>
            <p className="text-sm text-gray-600 max-w-2xl">
              The order categories appear in on the website (menus, category lists and Top Categories). Move a category up
              or down; it saves straight away.
            </p>
          </div>
        </div>
        <Select className="w-auto" aria-label="Category level" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Main categories</option>
          {mains.map((c) => (
            <option key={c.id} value={c.id}>
              Subcategories of {c.name}
            </option>
          ))}
        </Select>
      </div>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : level.length === 0 ? (
        <p className="text-sm text-gray-500">No categories at this level.</p>
      ) : (
        <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {level.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-6 text-right text-xs font-semibold text-gray-400">{i + 1}</span>
              <span className={`font-medium ${c.is_active ? "text-gray-800" : "text-gray-400 line-through"}`}>{c.name}</span>
              <span className="text-xs text-gray-400">{c.products_count} products</span>
              {canEdit && (
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" aria-label={`Move ${c.name} up`} disabled={i === 0 || reorder.isPending} onClick={() => move(level, i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="sm" variant="outline" aria-label={`Move ${c.name} down`} disabled={i === level.length - 1 || reorder.isPending} onClick={() => move(level, i, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
