import { cn } from "@/lib/cn";
import type { ShopOrder, ShopStatus } from "@/lib/api/services/shop-orders";

const STATUS: Record<ShopStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const PAYMENT: Record<ShopOrder["payment_status"], string> = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
};

const pill = "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap";

/** Design: status in UPPERCASE on a tinted pill. */
export function ShopStatusBadge({ status }: { status: ShopStatus }) {
  return <span className={cn(pill, STATUS[status] ?? "bg-gray-100 text-gray-800")}>{status.toUpperCase()}</span>;
}

export function ShopPaymentBadge({ status }: { status: ShopOrder["payment_status"] }) {
  return <span className={cn(pill, PAYMENT[status])}>{status.toUpperCase()}</span>;
}
