import { RotateCcw, ShoppingBag } from "lucide-react";
import Link from "next/link";

import type { CustomerProfile } from "@/lib/api/services/crm";
import { formatDate, formatTSh } from "@/lib/format";

import { num, orderHref, Pill, statusColor, TabEmpty, typeColor } from "./shared";

/** Design: "All Orders — {name}" table with a total row. */
export function OrdersTab({ profile }: { profile: CustomerProfile }) {
  const { orders, customer } = profile;
  const total = num(profile.kpis.total_spent);
  const headers = ["Order ID", "Date", "Product", "Category", "Type", "Amount", "Status"];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-semibold text-gray-900">All Orders — {customer.full_name}</h3>
        <span className="text-sm text-gray-500">
          Total spent: <span className="font-bold text-gray-800">{formatTSh(total)}</span>
        </span>
      </div>
      {orders.length === 0 ? (
        <TabEmpty icon={ShoppingBag} text="No orders yet" />
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-gray-100">
                {headers.map((h) => (
                  <th key={h} scope="col" className="text-left text-xs font-semibold text-gray-500 pb-3 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4 font-mono text-xs">
                    <Link href={orderHref(o)} className="text-blue-600 hover:underline">
                      {o.reference}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-gray-600 text-xs whitespace-nowrap">{formatDate(o.date)}</td>
                  <td className="py-3 pr-4 font-medium text-gray-900 max-w-48 truncate" title={o.product}>
                    {o.product || "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="text-xs text-gray-700">{o.category}</span>
                    {o.subcategory && <span className="block text-xs text-gray-400">{o.subcategory}</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <Pill label={o.type} className={typeColor(o.order_type)} />
                  </td>
                  <td className="py-3 pr-4 font-bold text-gray-800 whitespace-nowrap">{formatTSh(o.amount)}</td>
                  <td className="py-3">
                    <Pill label={o.status_display} className={statusColor(o.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td colSpan={5} className="pt-3 text-sm font-semibold text-gray-600">
                  Total paid
                </td>
                <td className="pt-3 font-bold text-blue-700 whitespace-nowrap">{formatTSh(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** Design: "Returns & Refunds — {name}" cards with the reason strip. */
export function ReturnsTab({ profile }: { profile: CustomerProfile }) {
  const { returns, customer } = profile;
  return (
    <div className="p-4 sm:p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Returns &amp; Refunds — {customer.full_name}</h3>
      {returns.length === 0 ? (
        <TabEmpty icon={RotateCcw} text="No returns on record" />
      ) : (
        <div className="space-y-3">
          {returns.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Link
                      href={`/returns?search=${encodeURIComponent(r.reference)}`}
                      className="font-mono text-xs text-gray-400 hover:text-blue-600 hover:underline"
                    >
                      {r.reference}
                    </Link>
                    <span className="text-xs text-gray-400">→ {r.order}</span>
                    <Pill label={r.status_display} className={statusColor(r.status)} />
                    {r.outcome && <Pill label={r.outcome} className={statusColor(r.outcome)} />}
                  </div>
                  <p className="font-semibold text-gray-900">{r.product || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{formatDate(r.date)}</p>
                  <p className="font-bold text-orange-600 whitespace-nowrap">{formatTSh(r.amount)}</p>
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-xs text-orange-800">
                <span className="font-semibold">Reason: </span>
                {r.reason}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
