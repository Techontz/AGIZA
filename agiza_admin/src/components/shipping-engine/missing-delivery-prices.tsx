"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { can, useMe } from "@/hooks/use-me";
import { shopOrderKeys, shopOrdersApi } from "@/lib/api/services/shop-orders";

/**
 * Orders placed while the Shipping Engine couldn't price delivery to the customer's address, with the
 * engine's reason, so whoever manages routes and rules sees the gaps customers actually hit.
 */
export function MissingDeliveryPrices() {
  const { data: me } = useMe();
  const canSee = can(me, "orders", "view");
  const query = { delivery_fee_pending: "true", page_size: 10 };
  const list = useQuery({
    queryKey: shopOrderKeys.list(query),
    queryFn: ({ signal }) => shopOrdersApi.list(query, signal),
    enabled: canSee,
  });
  const rows = (list.data?.results ?? []).filter((o) => o.status !== "cancelled");
  if (!canSee || rows.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-orange-300 bg-orange-50 p-5" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 flex-shrink-0 text-orange-600 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-orange-900">
            {list.data?.count ?? rows.length} order{(list.data?.count ?? rows.length) === 1 ? "" : "s"} waiting for a delivery price
          </p>
          <p className="text-sm text-orange-900 mt-0.5">
            Customers ordered to addresses the Shipping Engine can&apos;t price yet. Set their cost on the order, then add the
            missing route or rule so the next customers get a price straight away.
          </p>
          <ul className="mt-3 divide-y divide-orange-200 rounded-lg border border-orange-200 bg-white/70">
            {rows.map((o) => (
              <li key={o.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">
                    {o.reference} · {o.details.city?.name ?? o.details.full_address ?? "Unknown city"}
                  </span>
                  <Link href={`/orders/ecommerce?open=${o.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                    Open order
                  </Link>
                </div>
                {o.details.delivery_issue && (
                  <p className="mt-1 text-xs text-gray-700 whitespace-pre-line">{o.details.delivery_issue}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
