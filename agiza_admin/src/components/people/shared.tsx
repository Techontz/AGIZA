"use client";

import { type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { useApiMutation } from "@/hooks/use-api-mutation";
import { can, useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { peopleKeys, type CustomerTagChip, type ShipperService } from "@/lib/api/services/people";
import type { ModuleKey, StaffLevel } from "@/lib/api/types";
import { cn } from "@/lib/cn";

export type Errors = Record<string, string>;

const CUSTOMER_EDIT_MODULES: ModuleKey[] = ["people", "orders", "intake_quotes", "finance", "chat"];

/** UI permission hints per People tab (Django enforces the real rules). */
export function usePeopleAccess() {
  const { data: me } = useMe();
  return {
    me,
    /** Customers can also be registered by staff taking orders / quotes / payments / chats. */
    customers: CUSTOMER_EDIT_MODULES.some((m) => can(me, m, "edit")),
    /** Staff and driver accounts need People → manage. */
    staff: can(me, "people", "manage"),
    shippers: can(me, "people", "edit") || can(me, "shipping_engine", "edit"),
    /** Shop vendors are catalogue vendors: E-commerce → edit. */
    vendors: can(me, "ecommerce", "edit"),
    providers: can(me, "people", "edit"),
    providersDelete: can(me, "people", "manage"),
    campaigns: can(me, "people", "edit"),
  };
}

/**
 * A People change: refreshes the People lists and tab counts (plus any extra
 * keys) and routes 400 field errors to the form when `setErrors` is given.
 */
export function usePeopleMutation<V, R = unknown>(
  fn: (vars: V) => Promise<R>,
  opts: {
    success?: string | ((r: R) => string);
    onSuccess?: (r: R) => void;
    setErrors?: (e: Errors) => void;
    invalidate?: QueryKey[];
  } = {},
) {
  return useApiMutation(fn, {
    invalidate: [peopleKeys.all, ...(opts.invalidate ?? [])],
    success: opts.success,
    onSuccess: opts.onSuccess,
    onError: (err) => {
      const fe = fieldErrors(err);
      if (opts.setErrors && err instanceof ApiError && err.status === 400 && Object.keys(fe).length) {
        opts.setErrors(fe);
      } else {
        toast.error(errorText(err));
      }
    },
  });
}

/** Messages of field errors that no input on the form displays. */
export function FormErrors({ errors, fields }: { errors: Errors; fields: readonly string[] }) {
  const rest = Object.entries(errors).filter(([k]) => !fields.includes(k));
  if (!rest.length) return null;
  return (
    <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
      {rest.map(([k, v]) => (
        <p key={k}>{v}</p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- badges */

const LEVEL_STYLE: Record<StaffLevel, string> = {
  sales: "bg-blue-100 text-blue-800",
  finance: "bg-green-100 text-green-800",
  procurement: "bg-purple-100 text-purple-800",
  data_entry: "bg-gray-100 text-gray-800",
  admin_l1: "bg-orange-100 text-orange-800",
  admin_l2: "bg-red-100 text-red-800",
  top_admin: "bg-indigo-100 text-indigo-800",
  driver: "bg-cyan-100 text-cyan-800",
};
const LEVEL_LABEL: Record<StaffLevel, string> = {
  sales: "Sales",
  finance: "Finance",
  procurement: "Procurement",
  data_entry: "Data Entry",
  admin_l1: "Admin Level 1",
  admin_l2: "Admin Level 2",
  top_admin: "Top Admin",
  driver: "Driver",
};

/** The design's `getStaffLevelBadge`. */
export function StaffLevelBadge({ level }: { level: StaffLevel }) {
  return (
    <span className={cn("px-2 py-1 rounded text-xs font-medium whitespace-nowrap", LEVEL_STYLE[level])}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function StatusPill({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={cn(
        "px-3 py-1 rounded-full text-xs font-medium",
        status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800",
      )}
    >
      {status}
    </span>
  );
}

/** Customer tag chips: system (rule) purple, manual blue, "+N" beyond three. */
export function TagChips({ tags }: { tags: CustomerTagChip[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex gap-1 mt-1 flex-wrap">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag.id}
          title={tag.type === "system" ? "Added by a tag rule" : "Added manually"}
          className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            tag.type === "system" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700",
          )}
        >
          {tag.name}
        </span>
      ))}
      {tags.length > 3 && (
        <span
          className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
          title={tags.slice(3).map((t) => t.name).join(", ")}
        >
          +{tags.length - 3}
        </span>
      )}
    </div>
  );
}

export function Rating({ value }: { value: string | null }) {
  if (value === null || Number(value) <= 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex items-center gap-1">
      <span className="text-yellow-500" aria-hidden>
        ★
      </span>
      <span className="font-semibold text-gray-900">
        <span className="sr-only">Rating </span>
        {Number(value)}
      </span>
    </div>
  );
}

export const serviceLabel = (s: ShipperService | string) => s.replace(/_/g, " ");

/** Rating field value → API value ("" → null). */
export function ratingPayload(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

export function ratingError(value: string): string | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? null : "Enter a rating between 0 and 5.";
}
