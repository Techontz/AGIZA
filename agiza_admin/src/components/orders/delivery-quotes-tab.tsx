"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, Phone, Receipt, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useOrderAccess } from "@/components/orders/shared";
import { DeliveryFeeDialog } from "@/components/orders/shop/row-details";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { errorText } from "@/lib/api/errors";
import { shopOrderKeys, shopOrdersApi, type ShopOrder } from "@/lib/api/services/shop-orders";
import { formatDateTime } from "@/lib/format";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";
const COLUMNS = ["Order", "Customer", "Phone", "Destination", "Items", "What's missing", "Actions"];
/** Every live status: a cancelled order no longer needs a delivery cost. */
const LIVE = "pending,processing,ordered_from_supplier,at_origin_warehouse,shipping_to_destination,clearance,arrived,shipped,delivered";

function itemsText(o: ShopOrder): string {
  if (o.items?.length) return o.items.map((i) => (i.quantity > 1 ? `${i.product_name} ×${i.quantity}` : i.product_name)).join(", ");
  return o.item_details || "—";
}

/**
 * Shop orders placed while the Shipping Engine had no delivery rule for the customer's address:
 * staff set the delivery cost here (same dialog as on the shop order), then the customer can pay.
 */
export function DeliveryQuotesTab({ search, page, onPageChange }: { search: string; page: number; onPageChange: (page: number) => void }) {
  const { canEdit } = useOrderAccess();
  const [pricing, setPricing] = useState<ShopOrder | null>(null);
  const query = { delivery_fee_pending: "true", status: LIVE, search, page, page_size: 20 };
  const list = useQuery({
    queryKey: shopOrderKeys.list(query),
    queryFn: ({ signal }) => shopOrdersApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = (list.data?.results ?? []).filter((o) => o.status !== "cancelled");

  if (list.isError && !list.data) return <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />;
  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {COLUMNS.map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.isPending
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {COLUMNS.map((c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 rounded bg-gray-200 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((o) => {
                    const [first = "", ...rest] = (o.details.delivery_issue ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
                    const items = itemsText(o);
                    return (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors align-top">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 whitespace-nowrap">{o.reference}</div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(o.created_at)}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{o.customer.full_name}</td>
                        <td className="px-6 py-4">
                          {o.customer.phone ? (
                            <a href={`tel:${o.customer.phone}`} className="inline-flex items-center gap-1 text-sm font-medium text-gray-900 hover:text-blue-700 whitespace-nowrap">
                              <Phone className="size-3.5 text-gray-500" />
                              {o.customer.phone}
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-xs text-sm">
                            <div className="font-medium text-gray-900">{o.details.city?.name || "City not set"}</div>
                            {o.details.full_address && <div className="text-gray-500 line-clamp-2" title={o.details.full_address}>{o.details.full_address}</div>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-xs text-sm text-gray-900 line-clamp-2" title={items}>
                            {items}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {first ? (
                            <div className="max-w-xs text-sm" title={o.details.delivery_issue}>
                              <div className="font-semibold text-gray-900 line-clamp-2">{first}</div>
                              {rest.length > 0 && <div className="text-xs text-gray-500 line-clamp-2">{rest.join(" ")}</div>}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">No delivery rule for this address</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-2">
                            {canEdit && (
                              <Button size="sm" onClick={() => setPricing(o)} className="whitespace-nowrap">
                                <Receipt className="size-4" /> Set Delivery Cost
                              </Button>
                            )}
                            <Link href={`/orders/ecommerce?open=${o.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">
                              <ExternalLink className="size-3.5" /> Open order
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        {list.data && list.data.total_pages > 1 && (
          <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={onPageChange} />
        )}
      </Card>

      {list.data && rows.length === 0 && (
        <Card className="p-12 text-center mt-6">
          <Truck className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No orders are waiting for a delivery cost.</p>
        </Card>
      )}

      {/* Saving invalidates the "orders" tree, so this list and the tab count refresh. */}
      {pricing && <DeliveryFeeDialog order={pricing} open onClose={() => setPricing(null)} />}
    </>
  );
}
