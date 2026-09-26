"use client";

import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { errorText, fieldErrors } from "@/lib/api/errors";
import type { InvoiceStatus, ManualMethod, PaymentKind, PlanStatus } from "@/lib/api/services/finance";
import { orderKeys } from "@/lib/api/services/orders";
import { financeKeys } from "@/lib/api/services/finance";

/** Money changes move the orders' payment status too. */
export const FINANCE_INVALIDATE = [financeKeys.all, orderKeys.all];

export const METHODS: [ManualMethod, string][] = [
  ["cash", "Cash"],
  ["mobile_money", "Mobile Money"],
  ["bank_transfer", "Bank Transfer"],
  ["card", "Card"],
  ["other", "Other"],
];

export const KINDS: [Exclude<PaymentKind, "refund">, string][] = [
  ["balance", "Balance / Full"],
  ["advance", "Advance"],
  ["installment", "Installment"],
];

export const ORDER_TYPES: [string, string][] = [
  ["international", "International"],
  ["express", "Express Delivery"],
  ["equipment", "Equipment Support"],
  ["shop", "E-commerce Shop"],
];

export const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap";

/** "TSh 12.3M" as on the design's stat cards. */
export function formatMillions(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `TSh ${(n / 1_000_000).toFixed(1)}M`;
}

/** Positive decimal text ("1500", "1500.50") or null. */
export function parseAmount(value: string): number | null {
  const v = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** yyyy-mm-dd of today in local time (for <input type="date"> min values). */
export function todayInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Add days to a yyyy-mm-dd date (calendar arithmetic, no timezone drift). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const out = new Date(Date.UTC(y, m - 1, d + days));
  return out.toISOString().slice(0, 10);
}

/** A yyyy-mm-dd date shown without timezone shifts. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US");
}

/** API error summary for a dialog, leaving out field errors shown beside their inputs. */
export function FormAlert({ error, shown = [] }: { error: unknown; shown?: string[] }) {
  if (!error) return null;
  const fields = fieldErrors(error);
  const keys = Object.keys(fields);
  const message = keys.length
    ? keys
        .filter((k) => !shown.includes(k))
        .map((k) => fields[k])
        .join(" ")
    : errorText(error);
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {message}
    </p>
  );
}

/** Client-side checks win over the API's field errors. */
export function mergedErrors(error: unknown, local: Record<string, string>): Record<string, string> {
  return { ...fieldErrors(error), ...local };
}

export function DialogFooter({
  label,
  onSubmit,
  onClose,
  pending,
  disabled,
  variant = "primary",
}: {
  label: string;
  onSubmit: () => void;
  onClose: () => void;
  pending: boolean;
  disabled?: boolean;
  variant?: "primary" | "success" | "danger";
}) {
  return (
    <>
      <Button variant={variant} className="flex-1" onClick={onSubmit} loading={pending} disabled={disabled}>
        {label}
      </Button>
      <Button variant="muted" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
    </>
  );
}

const INVOICE_TONE: Record<InvoiceStatus, BadgeTone> = { draft: "gray", sent: "blue", paid: "green", void: "red" };

/** Design: `px-3 py-1 rounded-full text-xs` with the status upper-cased. */
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={INVOICE_TONE[status]}>{status.toUpperCase()}</Badge>;
}

const PLAN_TONE: Record<PlanStatus, BadgeTone> = {
  pending_approval: "orange",
  active: "blue",
  completed: "green",
  rejected: "red",
  cancelled: "gray",
};

export function PlanStatusBadge({ status, label }: { status: PlanStatus; label: string }) {
  return <Badge tone={PLAN_TONE[status]}>{label}</Badge>;
}
