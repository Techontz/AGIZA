"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, Search, type LucideIcon } from "lucide-react";

import { useApiMutation } from "@/hooks/use-api-mutation";
import { can, useMe } from "@/hooks/use-me";
import { cn } from "@/lib/cn";
import {
  inventoryKeys,
  warehouseApi,
  warehouseKeys,
  type StockStatus,
  type WarehouseStatus,
  type WarehouseType,
} from "@/lib/api/services/warehouse";

/* ------------------------------------------------------------ permissions */

/** UI hints only: Django enforces every rule. */
export function useWarehouseAccess() {
  const { data: me } = useMe();
  return { canEdit: can(me, "warehouse", "edit"), canManage: can(me, "warehouse", "manage") };
}

/* -------------------------------------------------------------- mutations */

/** Stock changes move product availability (catalogue, shop orders) too. */
export const STOCK_INVALIDATE = [inventoryKeys.all, ["catalog"], ["orders", "shop"]];
export const LOCATION_INVALIDATE = [warehouseKeys.all, inventoryKeys.all, ["shipping", "warehouses"]];

export function useStockMutation<V, R = unknown>(
  fn: (vars: V) => Promise<R>,
  opts: { success: string | ((r: R) => string); onSuccess?: (r: R) => void; onError: (e: unknown) => void },
) {
  return useApiMutation(fn, { invalidate: STOCK_INVALIDATE, ...opts });
}

/** Every location, for filters and pickers. */
export function useLocationOptions(enabled = true) {
  return useQuery({ queryKey: warehouseKeys.options, queryFn: () => warehouseApi.all(), staleTime: 60_000, enabled });
}

/* --------------------------------------------------------------- styling */

/** Design: `px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider`. */
export const th = "px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left whitespace-nowrap";
export const td = "px-4 py-3";
export const filterSelect =
  "px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none";
export const iconBtn = "p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const TYPE_TONE: Record<WarehouseType, string> = {
  consolidation: "bg-indigo-100 text-indigo-700",
  pickup_point: "bg-cyan-100 text-cyan-700",
  fulfillment: "bg-amber-100 text-amber-700",
  shop: "bg-purple-100 text-purple-700",
};

export const TYPE_LABEL: Record<WarehouseType, string> = {
  consolidation: "Consolidation",
  fulfillment: "Fulfillment",
  pickup_point: "Pickup Point",
  shop: "Shop",
};

export function WarehouseTypeBadge({ type, label }: { type: WarehouseType; label?: string }) {
  return <span className={cn("px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap", TYPE_TONE[type])}>{label ?? TYPE_LABEL[type]}</span>;
}

const STATUS_STYLE: Record<WarehouseStatus, [string, LucideIcon]> = {
  active: ["bg-green-100 text-green-800", CheckCircle2],
  full: ["bg-red-100 text-red-800", AlertCircle],
  inactive: ["bg-gray-100 text-gray-600", Clock],
};

export function WarehouseStatusBadge({ status, label }: { status: WarehouseStatus; label: string }) {
  const [tone, Icon] = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap", tone)}>
      <Icon className="size-3" />
      {label}
    </span>
  );
}

const STOCK_TONE: Record<StockStatus, string> = {
  in_stock: "bg-green-100 text-green-700",
  low_stock: "bg-orange-100 text-orange-700",
  out_of_stock: "bg-red-100 text-red-700",
  reserved: "bg-blue-100 text-blue-700",
  listed: "bg-green-100 text-green-700",
  hidden: "bg-gray-100 text-gray-500",
};

export function StockStatusBadge({ status, label }: { status: StockStatus; label: string }) {
  return <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", STOCK_TONE[status])}>{label}</span>;
}

/** Capacity bar: >80 red, >50 orange, else green. */
export function CapacityBar({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-20" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Capacity used">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className={cn("h-1.5 rounded-full", value > 80 ? "bg-red-500" : value > 50 ? "bg-orange-500" : "bg-green-500")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/** The design's small tinted count tile. */
export function MiniStat({ label, value, tone, loading }: { label: string; value?: number; tone: string; loading?: boolean }) {
  const [text, bg] = tone.split(" ");
  return (
    <div className={cn("rounded-xl p-4 border border-gray-100", bg)}>
      {loading ? <div className="h-8 w-10 rounded bg-white/70 animate-pulse" /> : <p className={cn("text-2xl font-bold", text)}>{value ?? 0}</p>}
      <p className="text-xs text-gray-600 mt-0.5">{label}</p>
    </div>
  );
}

/** Search box from the Warehouse design (`max-w-sm`, text-sm). */
export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative flex-1 w-full sm:max-w-sm min-w-48">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
    </div>
  );
}

/** Skeleton rows in the design's compact table. */
export function SkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c} className={td}>
              <div className={cn("h-4 rounded bg-gray-200 animate-pulse", c === 0 ? "w-20" : "w-full max-w-32")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A stale audit (none or older than 30 days) — mirrors the backend's "pending audits". */
export function auditPending(date: string | null, status: WarehouseStatus): boolean {
  if (status === "inactive") return false;
  if (!date) return true;
  return Date.now() - new Date(date).getTime() > 30 * 24 * 3600 * 1000;
}
