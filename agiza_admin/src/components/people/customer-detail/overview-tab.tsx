import { AlertCircle, ChevronRight, DollarSign, MessageSquare, Package, RotateCcw, ShoppingBag } from "lucide-react";
import Link from "next/link";

import type { CustomerProfile } from "@/lib/api/services/crm";
import { formatDate, formatTSh, timeAgo, titleCase } from "@/lib/format";

import { num, orderHref, Pill, SpendBars, statusColor } from "./shared";

export type DetailTab = "overview" | "orders" | "returns" | "quotations" | "interests" | "activity";

export function OverviewTab({ profile, onTab }: { profile: CustomerProfile; onTab: (tab: DetailTab) => void }) {
  const { customer, kpis, orders, quotations, category_spend } = profile;
  const unanswered = quotations.filter((q) => q.unanswered);
  const totalSpent = num(kpis.total_spent);

  const tiles = [
    { label: "Total Orders", value: kpis.total_orders.toLocaleString(), icon: ShoppingBag, color: "bg-blue-50 text-blue-600" },
    { label: "Total Spent", value: formatTSh(totalSpent), icon: DollarSign, color: "bg-green-50 text-green-600" },
    { label: "Returns", value: kpis.returns.toLocaleString(), icon: RotateCcw, color: "bg-orange-50 text-orange-600" },
    {
      label: "Unanswered Quotes",
      value: kpis.unanswered_quotes.toLocaleString(),
      icon: MessageSquare,
      color: kpis.unanswered_quotes > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500",
    },
  ];

  const fields: [string, string][] = [
    ["Customer ID", customer.reference],
    ["Status", titleCase(customer.status)],
    ["Member Since", formatDate(customer.created_at)],
  ];
  if (customer.company_name) fields.push(["Company", customer.company_name]);
  fields.push(["Last Activity", kpis.last_activity_at ? timeAgo(kpis.last_activity_at) : "No activity yet"]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {tiles.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-50 rounded-xl p-4 flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-lg shrink-0 ${color}`}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-lg font-bold text-gray-900 truncate" title={value}>
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {fields.map(([k, v]) => (
          <div key={k} className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">{k}</p>
            <p className="text-sm font-semibold text-gray-900">{v}</p>
          </div>
        ))}
      </div>

      {orders.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Recent Orders</h3>
            <button
              type="button"
              onClick={() => onTab("orders")}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="size-3" />
            </button>
          </div>
          <div className="space-y-2">
            {orders.slice(0, 3).map((o) => (
              <Link
                key={o.id}
                href={orderHref(o)}
                className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-4 py-2.5 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Package className="size-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{o.product || o.type}</p>
                    <p className="text-xs text-gray-400">
                      {o.reference} · {formatDate(o.date)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-3 shrink-0">
                  <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{formatTSh(o.amount)}</span>
                  <Pill label={o.status_display} className={statusColor(o.status)} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {unanswered.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-xl p-4" aria-label="Unanswered quotations">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="size-4 text-red-600" />
            <p className="text-sm font-semibold text-red-700">
              {unanswered.length} Unanswered Quotation{unanswered.length > 1 ? "s" : ""}
            </p>
          </div>
          {unanswered.map((q) => (
            <div key={q.id} className="bg-white border border-red-100 rounded-lg px-3 py-2 mb-2 last:mb-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-700 truncate">
                  {q.reference} · {q.service_type}
                </span>
                <span className="text-xs text-gray-400 shrink-0">{formatDate(q.date)}</span>
              </div>
              <p className="text-xs text-gray-600 italic line-clamp-3">&ldquo;{q.message}&rdquo;</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onTab("quotations")}
            className="mt-2 text-xs text-red-600 font-semibold hover:underline"
          >
            Respond now →
          </button>
        </section>
      )}

      {category_spend.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Spending Categories</h3>
          <SpendBars rows={category_spend} total={totalSpent} />
        </section>
      )}
    </div>
  );
}
