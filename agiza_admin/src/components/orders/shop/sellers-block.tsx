"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { FulfillmentBadge, SellerKindTag, SettlementBadge } from "@/components/ecommerce/marketplace-ui";
import { errorText } from "@/lib/api/errors";
import { marketplaceApi, marketplaceKeys } from "@/lib/api/services/marketplace";
import { formatDateTime, formatTSh } from "@/lib/format";

const th = "px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap";
const td = "px-4 py-3 text-sm whitespace-nowrap";

/**
 * Who sells what in this order: one row per seller (AGIZA or a vendor) with its
 * fulfilment status, AGIZA's commission, the vendor's net and settlement.
 */
export function OrderSellers({ orderId }: { orderId: number }) {
  const query = { order: orderId, page_size: 50 };
  const parts = useQuery({
    queryKey: marketplaceKeys.fulfillments(query),
    queryFn: ({ signal }) => marketplaceApi.fulfillments(query, signal),
  });
  const rows = parts.data?.results ?? [];
  const waiting = rows.filter((r) => r.vendor.self_service && r.status !== "ready" && r.status !== "shipped" && r.status !== "delivered" && r.status !== "cancelled");

  if (parts.isPending) return <div className="h-16 rounded bg-gray-100 animate-pulse" aria-hidden />;
  if (parts.isError) {
    return (
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Sellers</h4>
        <p className="text-sm text-red-600" role="alert">
          {errorText(parts.error)}{" "}
          <button type="button" onClick={() => parts.refetch()} className="font-medium text-blue-600 hover:text-blue-800">
            Retry
          </button>
        </p>
      </div>
    );
  }
  if (!rows.length) return null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h4 className="font-semibold text-gray-900">Sellers</h4>
        {waiting.length > 0 && (
          <p className="text-xs text-amber-700">
            Waiting for {waiting.map((w) => w.vendor.name).join(", ")} to mark their items ready for pickup before the order can ship.
          </p>
        )}
      </div>
      <div className="bg-white rounded border border-gray-200 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={th}>Seller</th>
              <th className={th}>Status</th>
              <th className={th}>Items</th>
              <th className={th}>Gross</th>
              <th className={th}>Commission</th>
              <th className={th}>Vendor Net</th>
              <th className={th}>Delivery Share</th>
              <th className={th}>Settlement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>
                  {r.vendor.id ? (
                    <Link href={`/ecommerce?section=vendors&vendor=${r.vendor.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {r.vendor.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-blue-700">AGIZA</span>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {r.vendor.id && <SellerKindTag selfService={r.vendor.self_service} />}
                    {r.origin && <span className="text-xs text-gray-500">from {r.origin}</span>}
                  </div>
                </td>
                <td className={td}>
                  <FulfillmentBadge status={r.status} label={r.status_display} />
                  {r.ready_at && r.status === "ready" && <div className="text-xs text-gray-500 mt-1">Ready {formatDateTime(r.ready_at)}</div>}
                </td>
                <td className={td}>{r.item_count}</td>
                <td className={`${td} font-semibold text-gray-900`}>{formatTSh(r.subtotal)}</td>
                <td className={`${td} text-gray-700`}>{r.vendor.id ? formatTSh(r.commission) : "—"}</td>
                <td className={`${td} text-gray-700`}>{r.vendor.id ? formatTSh(r.vendor_net) : "—"}</td>
                <td className={`${td} text-gray-700`}>{formatTSh(r.shipping_fee)}</td>
                <td className={td}>
                  {r.vendor.id ? <SettlementBadge status={r.settlement_status} title={r.settlement_display} /> : <span className="text-xs text-gray-400">—</span>}
                  {r.payout && <div className="text-xs text-gray-500 font-mono mt-1">{r.payout}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
