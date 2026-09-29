"use client";

import { DollarSign, Percent, Store } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { fileSrc } from "@/lib/api/files";
import type { ApprovalStatus, Vendor } from "@/lib/api/services/catalog";
import type { FulfillmentStatus, SettlementStatus } from "@/lib/api/services/marketplace";
import type { ReviewStatus } from "@/lib/api/services/products";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------ vendor status */

export const APPROVAL_TONE: Record<ApprovalStatus, BadgeTone> = {
  pending: "amber",
  under_review: "blue",
  changes_requested: "orange",
  approved: "green",
  rejected: "red",
  suspended: "gray",
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  under_review: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export function ApprovalBadge({ status, className }: { status: ApprovalStatus; className?: string }) {
  return (
    <Badge tone={APPROVAL_TONE[status] ?? "gray"} className={cn(status === "suspended" && "bg-gray-200 text-red-700", className)}>
      {APPROVAL_LABEL[status] ?? status}
    </Badge>
  );
}

/** "Self-service" (runs its own store in the seller app) or "Managed" (staff-managed). */
export function SellerKindTag({ selfService }: { selfService: boolean }) {
  return selfService ? (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700 whitespace-nowrap">Self-service</span>
  ) : (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600 whitespace-nowrap">Managed</span>
  );
}

/* ----------------------------------------------------------- product review */

const REVIEW_TONE: Record<ReviewStatus, BadgeTone> = {
  not_required: "gray",
  pending: "amber",
  approved: "green",
  rejected: "red",
  disabled: "gray",
};

export function ReviewStatusBadge({ status, label }: { status: ReviewStatus; label?: string }) {
  if (status === "not_required") return null;
  return (
    <Badge tone={REVIEW_TONE[status]} className="px-2 py-0.5">
      {label || status}
    </Badge>
  );
}

/* ------------------------------------------------------- fulfilment / money */

const FULFILLMENT_TONE: Record<FulfillmentStatus, BadgeTone> = {
  pending: "yellow",
  accepted: "blue",
  ready: "indigo",
  shipped: "purple",
  delivered: "green",
  cancelled: "red",
};

export function FulfillmentBadge({ status, label }: { status: FulfillmentStatus; label: string }) {
  return <Badge tone={FULFILLMENT_TONE[status] ?? "gray"}>{label}</Badge>;
}

const SETTLEMENT_TONE: Record<SettlementStatus, BadgeTone> = {
  pending: "amber",
  payable: "blue",
  settled: "green",
  void: "gray",
};
const SETTLEMENT_SHORT: Record<SettlementStatus, string> = {
  pending: "Pending",
  payable: "Payable",
  settled: "Paid out",
  void: "Void",
};

export function SettlementBadge({ status, title }: { status: SettlementStatus; title?: string }) {
  return (
    <span title={title}>
      <Badge tone={SETTLEMENT_TONE[status] ?? "gray"}>{SETTLEMENT_SHORT[status] ?? status}</Badge>
    </span>
  );
}

/* ------------------------------------------------------------------ vendor */

/** The store logo (authenticated proxy URL) or a neutral placeholder. */
export function VendorLogo({ vendor, size = "md" }: { vendor: Pick<Vendor, "name" | "logo_url" | "updated_at">; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "size-20 rounded-xl" : "size-10 rounded-lg";
  return vendor.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL
    <img
      src={fileSrc(`${vendor.logo_url}?v=${encodeURIComponent(vendor.updated_at)}`)}
      alt={`${vendor.name} logo`}
      loading="lazy"
      className={cn(cls, "object-cover border border-gray-200 bg-white flex-shrink-0")}
    />
  ) : (
    <div className={cn(cls, "border border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0")} aria-hidden>
      <Store className={cn(size === "lg" ? "size-8" : "size-5", "text-gray-300")} />
    </div>
  );
}

/** Commission terms: marketplace rates, or the vendor's own profit agreement. */
export function CommissionTerms({ vendor }: { vendor: Pick<Vendor, "commission_mode" | "profit_type" | "profit_value" | "profit_scope"> }) {
  if (vendor.commission_mode === "default") {
    return (
      <div className="flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-1 rounded w-fit whitespace-nowrap">
        <Percent className="size-4" />
        <span className="text-sm font-semibold">Marketplace rates</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {vendor.profit_type === "fixed" ? (
        <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded whitespace-nowrap">
          <DollarSign className="size-4" />
          <span className="text-sm font-semibold">TSh {Number(vendor.profit_value).toLocaleString("en-US")}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded">
          <Percent className="size-4" />
          <span className="text-sm font-semibold">{Number(vendor.profit_value)}%</span>
        </div>
      )}
      <div className="text-xs text-gray-500 whitespace-nowrap">{vendor.profit_scope === "all" ? "(All Products)" : "(Per Product)"}</div>
    </div>
  );
}

/** Label / value pair for the read-only detail grids. */
export function InfoItem({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <p className="text-xs text-gray-500">{label}</p>
      <div className="font-medium text-gray-900 break-words">{empty ? "—" : children}</div>
    </div>
  );
}

export const PAYOUT_METHOD: Record<string, string> = { mobile_money: "Mobile money", bank: "Bank transfer" };

/** "M-Pesa · 0712… · Jane Doe": where a vendor's payouts go, when known. */
export function payoutAccountText(v: Pick<Vendor, "payout_provider" | "payout_method" | "payout_account_number" | "payout_account_name">): string | undefined {
  const parts = [v.payout_provider || PAYOUT_METHOD[v.payout_method] || "", v.payout_account_number, v.payout_account_name].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}
