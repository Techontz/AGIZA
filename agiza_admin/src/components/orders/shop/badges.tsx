import { cn } from "@/lib/cn";
import type { ShopOrder, ShopStatus } from "@/lib/api/services/shop-orders";

const STATUS: Record<ShopStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  ordered_from_supplier: "bg-indigo-100 text-indigo-800",
  at_origin_warehouse: "bg-amber-100 text-amber-800",
  shipping_to_destination: "bg-cyan-100 text-cyan-800",
  clearance: "bg-orange-100 text-orange-800",
  arrived: "bg-teal-100 text-teal-800",
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
export function ShopStatusBadge({ status, label }: { status: ShopStatus; label?: string }) {
  return <span className={cn(pill, STATUS[status] ?? "bg-gray-100 text-gray-800")}>{(label || status.replace(/_/g, " ")).toUpperCase()}</span>;
}

export function ShopPaymentBadge({ status }: { status: ShopOrder["payment_status"] }) {
  return <span className={cn(pill, PAYMENT[status])}>{status.toUpperCase()}</span>;
}

/** The customer ordered while the delivery needed a manual quote: staff must set the cost before they can pay. */
export function DeliveryFeePendingBadge() {
  return <span className={cn(pill, "bg-orange-100 text-orange-800 ring-1 ring-orange-300")}>NEEDS MANUAL DELIVERY COST</span>;
}
