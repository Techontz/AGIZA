import { cn } from "@/lib/cn";
import type { ClientValue, OrderKind, ProfileOrder } from "@/lib/api/services/crm";
import { formatTSh } from "@/lib/format";

/** Design: `px-2 py-0.5 rounded-full text-xs font-medium` pill. */
export function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", className)}>{label}</span>
  );
}

export const CLIENT_VALUE: Record<ClientValue, { label: string; color: string }> = {
  curious: { label: "Curious Client", color: "bg-gray-100 text-gray-600" },
  customer: { label: "Customer", color: "bg-blue-100 text-blue-700" },
  repeating: { label: "Repeating Customer", color: "bg-green-100 text-green-700" },
  high_value: { label: "High Value Client", color: "bg-amber-100 text-amber-700" },
};

const TYPE_COLORS: Record<OrderKind, string> = {
  international: "bg-blue-50 text-blue-700",
  shop: "bg-purple-50 text-purple-700",
  express: "bg-teal-50 text-teal-700",
  equipment: "bg-amber-50 text-amber-700",
};

export function typeColor(kind: OrderKind): string {
  return TYPE_COLORS[kind] ?? "bg-gray-100 text-gray-600";
}

/** Status pill colour from the design palette, keyed on the backend status code. */
export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (/(delivered|completed|closed|approved|quoted|accepted|converted)/.test(s))
    return "bg-green-100 text-green-700";
  if (/(cancel|reject|fail|lost|expired|declined)/.test(s)) return "bg-red-100 text-red-700";
  if (/(ship|transit|dispatch|out_for|arrived|customs)/.test(s)) return "bg-indigo-100 text-indigo-700";
  if (/(refund)/.test(s)) return "bg-orange-100 text-orange-700";
  if (/(replace)/.test(s)) return "bg-purple-100 text-purple-700";
  return "bg-blue-100 text-blue-700";
}

/** Where an order row opens in the admin. */
export function orderHref(o: Pick<ProfileOrder, "id" | "reference" | "order_type">): string {
  const ref = encodeURIComponent(o.reference);
  switch (o.order_type) {
    case "international":
      return `/orders/international?open=${o.id}`;
    case "shop":
      return `/orders/ecommerce?search=${ref}`;
    case "express":
      return `/orders/express?search=${ref}`;
    case "equipment":
      return `/orders/equipment-support?open=${o.id}`;
    default:
      return `/orders?search=${ref}`;
  }
}

export function num(value: string | number | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Spend-by-category bars (Overview "Top Spending Categories" and the breakdown). */
export function SpendBars({
  rows,
  total,
  detailed,
}: {
  rows: { category: string; amount: string | null }[];
  total: number;
  detailed?: boolean;
}) {
  return (
    <div className={detailed ? "space-y-2.5" : "space-y-2"}>
      {rows.map(({ category, amount }) => {
        const spend = num(amount);
        const pct = total > 0 ? (spend / total) * 100 : 0;
        return (
          <div key={category} className="flex items-center gap-3">
            <span
              className={cn("text-sm text-gray-700 truncate", detailed ? "w-24 sm:w-36 capitalize" : "w-24 sm:w-32")}
              title={category}
            >
              {category}
            </span>
            <div
              className={cn("flex-1 rounded-full", detailed ? "bg-gray-100 h-2.5" : "bg-gray-200 h-2")}
              role="meter"
              aria-label={`${category} share of spend`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
            >
              <div
                className={cn("bg-blue-500 rounded-full", detailed ? "h-2.5" : "h-2")}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span
              className={cn(
                "text-xs text-right whitespace-nowrap",
                detailed ? "font-semibold text-gray-600 w-28 sm:w-32" : "text-gray-500 w-24 sm:w-28",
              )}
            >
              {formatTSh(spend)}
            </span>
            {detailed && <span className="text-xs text-gray-400 w-10 text-right">{Math.round(pct)}%</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Empty state inside a tab (design: centred icon at 30% opacity + grey text). */
export function TabEmpty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <Icon className="size-10 mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}
