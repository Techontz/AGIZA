"use client";

import { AlertTriangle } from "lucide-react";

import { can, useMe } from "@/hooks/use-me";
import { cn } from "@/lib/cn";
import type {
  FinancialImpact,
  ReasonCode,
  RefundStatus,
  ReturnExceptionFlag,
  ReturnOwner,
  ReturnStatus,
  ReturnType,
} from "@/lib/api/services/returns";

/* Colours and labels reproduce Returns.tsx (Figma Make). */

const pill = "px-3 py-1 rounded-full text-xs font-medium inline-flex w-fit items-center whitespace-nowrap";

export const RETURN_TYPE: Record<ReturnType, [string, string]> = {
  delivery_failed: ["bg-orange-100 text-orange-800", "Delivery Failed"],
  customer_rejected: ["bg-red-100 text-red-800", "Customer Rejected"],
  damaged_item: ["bg-red-100 text-red-800", "Damaged Item"],
  wrong_item: ["bg-yellow-100 text-yellow-800", "Wrong Item"],
  cancellation_after_dispatch: ["bg-purple-100 text-purple-800", "Cancellation After Dispatch"],
  customer_request: ["bg-indigo-100 text-indigo-800", "Customer Return Request"],
  seller_cannot_fulfill: ["bg-orange-100 text-orange-800", "Seller Couldn't Fulfil"],
};

/** Types AGIZA creates itself (customer requests, a seller's cancelled part): not offered in "New Return". */
export const SYSTEM_RETURN_TYPES: ReturnType[] = ["customer_request", "seller_cannot_fulfill"];

export const RETURN_STATUS: Record<ReturnStatus, [string, string]> = {
  initiated: ["bg-blue-100 text-blue-800", "Initiated"],
  in_transit: ["bg-purple-100 text-purple-800", "In Transit (Return)"],
  received: ["bg-yellow-100 text-yellow-800", "Received"],
  inspected: ["bg-orange-100 text-orange-800", "Inspected"],
  approved: ["bg-green-100 text-green-800", "Approved"],
  rejected: ["bg-red-100 text-red-800", "Rejected"],
  closed: ["bg-gray-100 text-gray-800", "Closed"],
};

export const OWNER: Record<ReturnOwner, [string, string]> = {
  delivery: ["bg-blue-100 text-blue-800", "Delivery"],
  warehouse: ["bg-purple-100 text-purple-800", "Warehouse"],
  support: ["bg-green-100 text-green-800", "Support"],
  finance: ["bg-orange-100 text-orange-800", "Finance"],
};

export const REASON: Record<ReasonCode, string> = {
  customer_unavailable: "Customer Unavailable",
  address_incorrect: "Address Incorrect",
  damaged_in_transit: "Damaged in Transit",
  customer_changed_mind: "Customer Changed Mind",
  item_mismatch: "Item Mismatch",
  defective: "Defective / Doesn't Work",
  not_as_described: "Not as Described",
  seller_unavailable: "Seller Couldn't Supply the Item",
};

export const IMPACT: Record<FinancialImpact, [string, string]> = {
  refund_required: ["bg-red-100 text-red-800", "Refund Required"],
  replacement_required: ["bg-yellow-100 text-yellow-800", "Replacement Required"],
  no_refund: ["bg-green-100 text-green-800", "No Refund"],
};

export const RETURN_EXCEPTION: Record<ReturnExceptionFlag, [string, string]> = {
  dispute: ["bg-red-100 text-red-800", "Dispute"],
  high_value_item: ["bg-purple-100 text-purple-800", "High-Value Item"],
  customer_complaint: ["bg-orange-100 text-orange-800", "Customer Complaint"],
};

function Pill({ map, value, fallback }: { map: Record<string, [string, string]>; value: string; fallback: string }) {
  const [cls, label] = map[value] ?? ["bg-gray-100 text-gray-800", fallback];
  return <span className={cn(pill, cls)}>{label}</span>;
}

export const ReturnTypeBadge = ({ type, label }: { type: ReturnType; label: string }) => <Pill map={RETURN_TYPE} value={type} fallback={label} />;
export const ReturnStatusBadge = ({ status, label }: { status: ReturnStatus; label: string }) => <Pill map={RETURN_STATUS} value={status} fallback={label} />;
export const OwnerBadge = ({ owner, label }: { owner: ReturnOwner; label: string }) => <Pill map={OWNER} value={owner} fallback={label} />;
export const ImpactBadge = ({ impact, label }: { impact: FinancialImpact; label: string }) => <Pill map={IMPACT} value={impact} fallback={label} />;

/** Opened by the customer from their account. */
export function CustomerRequestTag() {
  return <span className={cn(pill, "bg-indigo-100 text-indigo-800")}>Customer request</span>;
}

const REFUND: Record<RefundStatus, [string, string]> = {
  not_decided: ["bg-gray-100 text-gray-700", "Refund not decided"],
  pending: ["bg-orange-100 text-orange-800", "Refund pending"],
  refunded: ["bg-green-100 text-green-800", "Refunded"],
  none: ["bg-gray-100 text-gray-500", "No refund"],
};

export const RefundStatusBadge = ({ status }: { status: RefundStatus }) => <Pill map={REFUND} value={status} fallback={status} />;

export function ReturnExceptionBadge({ flag }: { flag: ReturnExceptionFlag | "" }) {
  if (!flag) return null;
  const [cls, label] = RETURN_EXCEPTION[flag];
  return (
    <span className={cn(pill, "gap-1", cls)}>
      <AlertTriangle className="size-3" />
      {label}
    </span>
  );
}

/** UI hints only: Django enforces the same rules. */
export function useReturnAccess() {
  const { data: me } = useMe();
  return {
    canEdit: can(me, "returns", "edit"),
    /** Paying out an approved refund when closing. */
    canRefund: can(me, "finance", "edit") || can(me, "returns", "manage"),
  };
}
