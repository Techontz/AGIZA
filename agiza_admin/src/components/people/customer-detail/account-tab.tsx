"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from "lucide-react";
import Link from "next/link";

import { ErrorState } from "@/components/ui/states";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys } from "@/lib/api/services/finance";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatTSh } from "@/lib/format";

import { TabEmpty } from "./shared";

const ORDER_PAGE: Record<string, string> = {
  international: "/orders/international",
  express: "/orders/express",
  shop: "/orders/ecommerce",
  equipment: "/orders/equipment-support",
};

function Figure({ label, value, tone, icon: Icon, hint }: { label: string; value: string; tone: string; icon: typeof Wallet; hint: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Icon className={cn("size-4", tone)} />
        {label}
      </div>
      <p className={cn("text-2xl font-bold mt-1", tone)}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
    </div>
  );
}

/** Account: what the customer owes on orders (incl. installments / released balances) vs their wallet credit. */
export function AccountTab({ customerId }: { customerId: number }) {
  const q = useQuery({ queryKey: financeKeys.account(customerId), queryFn: () => financeApi.account(customerId) });
  if (q.isPending) return <div className="p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />)}</div>;
  if (q.isError) return <ErrorState bare message={errorText(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data;
  const net = Number(a.net);
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Figure label="Owes AGIZA" value={formatTSh(a.owed_by_customer)} tone="text-red-600" icon={ArrowUpRight} hint="Unpaid balance on open orders" />
        <Figure label="AGIZA owes (credit)" value={formatTSh(a.owed_to_customer)} tone="text-green-600" icon={ArrowDownLeft} hint="Wallet: deposits and refunds" />
        <Figure
          label="Net position"
          value={formatTSh(String(Math.abs(net)))}
          tone={net > 0 ? "text-red-600" : net < 0 ? "text-green-600" : "text-gray-900"}
          icon={Scale}
          hint={net > 0 ? "Customer owes AGIZA" : net < 0 ? "AGIZA owes the customer" : "Settled"}
        />
      </div>

      <div>
        <h3 className="font-semibold text-gray-900 mb-2">Orders with a balance</h3>
        {a.orders.length === 0 ? (
          <TabEmpty icon={Scale} text="Nothing owed on orders." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  {["Order", "Total", "Paid", "Due", "Terms"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {a.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2">
                      <Link href={`${ORDER_PAGE[o.order_type] ?? "/orders"}?search=${encodeURIComponent(o.reference)}&open=${o.id}`} className="font-medium text-blue-600 hover:underline">
                        {o.reference}
                      </Link>
                      <div className="text-xs text-gray-500 max-w-xs truncate">{o.item_details}</div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatTSh(o.total)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-green-700">{formatTSh(o.paid)}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-semibold text-red-600">{formatTSh(o.due)}</td>
                    <td className="px-4 py-2 text-xs">
                      {o.on_installments && <span className="block text-purple-700">Installments</span>}
                      {o.next_installment && (
                        <span className={cn("block", o.next_installment.overdue ? "text-red-600 font-medium" : "text-gray-600")}>
                          Next {formatTSh(o.next_installment.amount)} {o.next_installment.overdue ? "was due" : "due"} {formatDate(o.next_installment.due_date)}
                        </span>
                      )}
                      {o.released_with_balance && <span className="block text-amber-700">Released with balance (credit)</span>}
                      {!o.on_installments && !o.released_with_balance && <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900">Wallet activity</h3>
          <Link href="/finance/wallets" className="text-sm text-blue-600 hover:underline">Manage in Finance →</Link>
        </div>
        {a.wallet_transactions.length === 0 ? (
          <TabEmpty icon={Wallet} text="No wallet activity yet." />
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {a.wallet_transactions.map((t) => (
              <li key={t.id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="text-gray-900">{t.source_display}{t.order ? ` · ${t.order}` : ""}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(t.created_at)}{t.note ? ` — ${t.note}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className={cn("font-semibold", t.kind === "credit" ? "text-green-600" : "text-red-600")}>
                    {t.kind === "credit" ? "+" : "−"}{formatTSh(t.amount)}
                  </p>
                  <p className="text-xs text-gray-500">Balance {formatTSh(t.balance_after)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
