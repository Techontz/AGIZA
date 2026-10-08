"use client";

import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { catalogApi, catalogKeys } from "@/lib/api/services/catalog";

import { useCatalogAccess, useCatalogMutation } from "./shared";
import { OrderedProductPicker, type PickedProduct } from "./website-homepage-section";

const MAX = 60;

/**
 * "Hot Sales" on the app's home screen (and the website's Featured products row): the featured products,
 * in the order staff arrange here. Products added here become featured; removing one un-features it.
 */
export function HotSalesSection() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.hotSales, queryFn: ({ signal }) => catalogApi.hotSales.list(signal) });
  const [picks, setPicks] = useState<PickedProduct[] | null>(null);

  // Start from the saved list; edits stay local until "Save order".
  useEffect(() => {
    if (list.data && picks === null) setPicks(list.data.map(({ id, name, sku, status }) => ({ id, name, sku, status })));
  }, [list.data, picks]);

  const saved = (list.data ?? []).map((p) => p.id).join(",");
  const current = (picks ?? []).map((p) => p.id).join(",");
  const dirty = picks !== null && saved !== current;

  const save = useCatalogMutation((ids: number[]) => catalogApi.hotSales.save(ids), {
    success: "Hot Sales saved",
    onSuccess: (rows) => setPicks(rows.map(({ id, name, sku, status }) => ({ id, name, sku, status }))),
  });

  if (list.isError && !list.data) return <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />;

  return (
    <Card className="p-6 shadow-none space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <Flame className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Hot Sales</h2>
            <p className="text-sm text-gray-600 max-w-2xl">
              The products in the app&apos;s <span className="font-medium">Hot Sales</span> row and the website&apos;s
              Featured products, in this order (number 1 shows first). Adding a product here marks it Featured;
              removing it takes it out of Hot Sales.
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
        <p className="text-sm text-gray-500">No products in Hot Sales yet.</p>
      )}

      {dirty && <p className="text-xs text-amber-700">You have unsaved changes. Click &quot;Save order&quot; to publish them.</p>}
    </Card>
  );
}
