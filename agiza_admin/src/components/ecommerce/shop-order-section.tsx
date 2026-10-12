"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpToLine, ListOrdered, Pin } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { fileSrc } from "@/lib/api/files";
import { catalogApi, catalogKeys, type Category } from "@/lib/api/services/catalog";
import { productKeys, productsApi } from "@/lib/api/services/products";
import { formatTSh } from "@/lib/format";

import { useCatalogAccess, useCatalogMutation } from "./shared";

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

type Card = { id: number; name: string; sku: string; price: string; image: string | null; pinned: boolean };

/**
 * The website shop's product order, as cards: pinned products first (in staff order), then the rest newest
 * first, exactly as customers see it. Moving a card (Top, arrows or drag) pins it and every card above it in
 * their current places, and saves straight away; "Unpin" sends a product back to the newest-first order.
 */
function PinnedProducts() {
  const { canEdit } = useCatalogAccess();
  const pinnedQuery = useQuery({ queryKey: catalogKeys.shopOrder, queryFn: ({ signal }) => catalogApi.shopOrder.list(signal) });
  const [shown, setShown] = useState(48);
  const restQuery = { status: "active", ordering: "-created_at", page: 1, page_size: shown };
  const rest = useQuery({
    queryKey: productKeys.list(restQuery),
    queryFn: ({ signal }) => productsApi.list(restQuery, signal),
    placeholderData: keepPreviousData,
  });
  const qc = useQueryClient();
  const [pending, setPending] = useState<number[] | null>(null); // pinned ids while a save is on its way
  const [dragged, setDragged] = useState<number | null>(null);
  const save = useCatalogMutation((ids: number[]) => catalogApi.shopOrder.save(ids), {
    success: "Saved — the website shows this order now",
    onSuccess: (rows) => {
      qc.setQueryData(catalogKeys.shopOrder, rows);
      setPending(null);
    },
  });

  const cards = useMemo<Card[]>(() => {
    const saved = pinnedQuery.data ?? [];
    const byId = new Map<number, Card>();
    for (const p of saved) byId.set(p.id, { id: p.id, name: p.name, sku: p.sku, price: p.price, image: p.image, pinned: true });
    for (const p of rest.data?.results ?? [])
      if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name, sku: p.sku, price: p.price, image: p.image ? fileSrc(p.image) : null, pinned: false });
    // While saving, show the new order; if the save failed, the saved one.
    const pinnedIds = (save.isError ? null : pending) ?? saved.map((p) => p.id);
    const pinned = pinnedIds.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c)).map((c) => ({ ...c, pinned: true }));
    const others = [...byId.values()].filter((c) => !pinnedIds.includes(c.id)).map((c) => ({ ...c, pinned: false }));
    return [...pinned, ...others];
  }, [pinnedQuery.data, rest.data, pending, save.isError]);

  const pinnedCount = cards.filter((c) => c.pinned).length;
  const commit = (ids: number[]) => {
    const next = ids.slice(0, MAX);
    setPending(next);
    save.mutate(next);
  };
  /** Put card `from` at place `to`: it and everything above it keep these places on the website. */
  const place = (from: number, to: number) => {
    if (to < 0 || to >= cards.length || from === to) return;
    const order = cards.map((c) => c.id);
    const [id] = order.splice(from, 1);
    order.splice(to, 0, id);
    // A card entering the pinned group adds one; one leaving it removes one; everything above the moved card stays put.
    const entering = from >= pinnedCount && to < pinnedCount ? 1 : 0;
    const leaving = from < pinnedCount && to >= pinnedCount ? 1 : 0;
    commit(order.slice(0, Math.max(pinnedCount + entering - leaving, to + 1)));
  };
  const unpin = (id: number) => commit(cards.filter((c) => c.pinned && c.id !== id).map((c) => c.id));

  if ((pinnedQuery.isError && !pinnedQuery.data) || (rest.isError && !rest.data)) {
    return <ErrorState message={((pinnedQuery.error ?? rest.error) as Error).message} onRetry={() => (pinnedQuery.refetch(), rest.refetch())} />;
  }

  return (
    <Card className="p-6 shadow-none space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
          <Pin className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-bold text-gray-900">Product order on the website</h2>
          <p className="text-sm text-gray-600 max-w-3xl">
            This is the order customers see in the website shop. Click <span className="font-medium">Move to top</span> on a
            product you want to sell quickly, or use the arrows (you can also drag a card). Changes save by themselves.
          </p>
        </div>
      </div>

      {!pinnedQuery.data || !rest.data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-gray-500">No active products yet.</p>
      ) : (
        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {cards.map((c, i) => (
            <li
              key={c.id}
              draggable={canEdit && !save.isPending}
              onDragStart={() => setDragged(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragged !== null) place(dragged, i);
                setDragged(null);
              }}
              onDragEnd={() => setDragged(null)}
              className={`relative flex flex-col rounded-lg border bg-white p-2 ${c.pinned ? "border-emerald-300" : "border-gray-200"} ${
                dragged === i ? "opacity-40" : ""
              } ${canEdit ? "cursor-grab" : ""}`}
            >
              <span className={`absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-xs font-bold ${c.pinned ? "bg-emerald-600 text-white" : "bg-gray-900/70 text-white"}`}>
                {i + 1}
              </span>
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt="" className="aspect-square w-full rounded object-cover bg-gray-50" draggable={false} />
              ) : (
                <span className="aspect-square w-full rounded bg-gray-50 border border-dashed border-gray-200" />
              )}
              <p className="mt-2 text-sm font-medium text-gray-900 line-clamp-2" title={c.name}>{c.name}</p>
              <p className="text-xs text-gray-500">{formatTSh(c.price)}</p>
              {canEdit && (
                <div className="mt-2 flex items-center gap-1">
                  <Button size="sm" variant={i === 0 ? "outline" : "primary"} className="flex-1 px-2" disabled={i === 0 || save.isPending} onClick={() => place(i, 0)}>
                    <ArrowUpToLine className="size-3.5" /> {i === 0 ? "First" : "Move to top"}
                  </Button>
                  <Button size="sm" variant="outline" className="px-2" aria-label={`Move ${c.name} up`} disabled={i === 0 || save.isPending} onClick={() => place(i, i - 1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="px-2" aria-label={`Move ${c.name} down`} disabled={i === cards.length - 1 || save.isPending} onClick={() => place(i, i + 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
              )}
              {canEdit && c.pinned && (
                <button type="button" onClick={() => unpin(c.id)} disabled={save.isPending} className="mt-1 text-xs text-gray-500 hover:text-red-600 text-left">
                  Unpin (back to normal order)
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {rest.data && rest.data.count > shown && (
        <div className="text-center">
          <Button variant="outline" disabled={rest.isFetching} onClick={() => setShown(shown + 48)}>
            {rest.isFetching ? "Loading…" : `Show more products (${rest.data.count - shown} more)`}
          </Button>
        </div>
      )}
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
