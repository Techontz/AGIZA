import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Delivery, DeliveryExceptionFlag, DeliverySource, DeliveryStatus, DeliveryType } from "@/lib/api/services/deliveries";

/* Colours reproduce DeliveriesManagement.tsx (Figma Make). */

const pill = "px-3 py-1 rounded-full text-xs font-medium inline-flex w-fit items-center whitespace-nowrap";

export const DELIVERY_STATUS: Record<DeliveryStatus, [string, string]> = {
  pending: ["bg-yellow-100 text-yellow-800", "Pending"],
  assigned_driver: ["bg-blue-100 text-blue-800", "Assigned Driver"],
  out_for_delivery: ["bg-purple-100 text-purple-800", "Out for Delivery"],
  delivered: ["bg-green-100 text-green-800", "Delivered"],
  failed: ["bg-red-100 text-red-800", "Failed"],
  rescheduled: ["bg-orange-100 text-orange-800", "Rescheduled"],
  returned: ["bg-gray-100 text-gray-800", "Returned"],
  cancelled: ["bg-gray-100 text-gray-500", "Cancelled"],
};

const TYPE: Record<DeliveryType, [string, string]> = {
  standard: ["bg-gray-100 text-gray-800", "Standard"],
  express: ["bg-blue-100 text-blue-800", "Express"],
  same_day: ["bg-purple-100 text-purple-800", "Same Day"],
  inter_city: ["bg-green-100 text-green-800", "Inter-City"],
};

export const EXCEPTION: Record<DeliveryExceptionFlag, [string, string]> = {
  customer_unavailable: ["bg-orange-100 text-orange-800", "Customer Unavailable"],
  payment_issue: ["bg-red-100 text-red-800", "Payment Issue"],
  address_unclear: ["bg-yellow-100 text-yellow-800", "Address Unclear"],
};

const SOURCE: Record<DeliverySource, [string, string]> = {
  international: ["bg-blue-100 text-blue-800", "International"],
  shop: ["bg-green-100 text-green-800", "Shop"],
  local_delivery: ["bg-purple-100 text-purple-800", "Local Delivery"],
};

export function DeliveryStatusBadge({ delivery }: { delivery: Pick<Delivery, "status" | "status_display"> }) {
  const [cls, label] = DELIVERY_STATUS[delivery.status] ?? ["bg-gray-100 text-gray-800", delivery.status_display];
  return <span className={cn(pill, cls)}>{label}</span>;
}

export function DeliveryTypeBadge({ type, label }: { type: DeliveryType; label: string }) {
  const [cls, l] = TYPE[type] ?? ["bg-gray-100 text-gray-800", label];
  return <span className={cn("px-2 py-1 rounded text-xs font-medium whitespace-nowrap", cls)}>{l.toUpperCase()}</span>;
}

export function DeliveryExceptionBadge({ flag }: { flag: DeliveryExceptionFlag | "" }) {
  if (!flag) return null;
  const [cls, label] = EXCEPTION[flag];
  return (
    <span className={cn(pill, "gap-1", cls)}>
      <AlertTriangle className="size-3" />
      {label}
    </span>
  );
}

export function OrderSourceBadge({ source, label }: { source: DeliverySource; label: string }) {
  const [cls, l] = SOURCE[source] ?? ["bg-gray-100 text-gray-800", label];
  return <span className={cn(pill, cls)}>{l}</span>;
}
