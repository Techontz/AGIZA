import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  EXCEPTION_FLAGS,
  PROCUREMENT_ORIGINS,
  PROCUREMENT_STATUS,
  type ExceptionFlag,
  type ProcurementStatus,
} from "@/lib/api/services/procurement";

const pill = "px-3 py-1 rounded-full text-xs font-medium inline-block w-fit whitespace-nowrap";

export function originLabel(iso2: string, fallback?: string): string {
  return PROCUREMENT_ORIGINS.find(([code]) => code === iso2)?.[1] ?? fallback ?? iso2;
}

/** Design: uppercase origin pill ("CHINA", "DUBAI"...). */
export function ProcurementOriginBadge({ iso2, name }: { iso2: string; name?: string }) {
  const hit = PROCUREMENT_ORIGINS.find(([code]) => code === iso2);
  return <span className={cn(pill, "uppercase", hit?.[2] ?? "bg-gray-100 text-gray-800")}>{hit?.[1] ?? name ?? iso2}</span>;
}

export function ProcurementStatusBadge({ status, label }: { status: ProcurementStatus; label?: string }) {
  const [c, l] = PROCUREMENT_STATUS[status] ?? ["bg-gray-100 text-gray-800", label ?? status];
  return <span className={cn(pill, c)}>{l}</span>;
}

export function ExceptionBadge({ flag }: { flag: ExceptionFlag }) {
  if (!flag) {
    return (
      <span className="text-green-600 text-sm flex items-center gap-1 whitespace-nowrap">
        <CheckCircle2 className="size-4" />
        No Issues
      </span>
    );
  }
  const [c, l] = EXCEPTION_FLAGS[flag];
  return (
    <span className={cn("px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit whitespace-nowrap", c)}>
      <AlertTriangle className="size-3" />
      {l}
    </span>
  );
}
