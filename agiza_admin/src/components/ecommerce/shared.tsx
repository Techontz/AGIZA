"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { can, useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { catalogKeys, type LabelColor } from "@/lib/api/services/catalog";
import { cn } from "@/lib/cn";

export type Errors = Record<string, string>;

/** Label badge colours, exactly as the design's `labelColorMap`. */
export const labelColorMap: Record<LabelColor, string> = {
  blue: "bg-blue-500 text-white",
  red: "bg-red-500 text-white",
  yellow: "bg-yellow-400 text-gray-900",
  purple: "bg-purple-500 text-white",
  orange: "bg-orange-500 text-white",
  green: "bg-green-500 text-white",
  gray: "bg-gray-500 text-white",
};

/** UI permission hints (Django enforces the real rules). */
export function useCatalogAccess() {
  const { data: me } = useMe();
  return { canEdit: can(me, "ecommerce", "edit"), canManage: can(me, "ecommerce", "manage") };
}

/**
 * A catalogue change: refreshes every catalogue query (counts cross resources)
 * and routes 400 field errors to the form when `setErrors` is given.
 */
export function useCatalogMutation<V, R = unknown>(
  fn: (vars: V) => Promise<R>,
  opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; setErrors?: (e: Errors) => void } = {},
) {
  return useApiMutation(fn, {
    invalidate: [catalogKeys.all],
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

/** The design's ToggleRight / ToggleLeft icon as a real switch. */
export function IconSwitch({
  checked,
  onChange,
  label,
  disabled,
  size = "sm",
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "lg";
  className?: string;
}) {
  const Icon = checked ? ToggleRight : ToggleLeft;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50" : "p-0.5 text-gray-400 hover:text-blue-600",
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "size-5" : "size-8", checked && "text-blue-600")} />
    </button>
  );
}

/** Sub-section header with the design's back arrow. */
export function SectionHeader({
  title,
  description,
  onBack,
  actions,
  backLabel = "Back to E-commerce Platform",
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  onBack: () => void;
  actions?: React.ReactNode;
  backLabel?: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={backLabel}
          title={backLabel}
        >
          <ChevronRight className="size-6 text-gray-600 rotate-180" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600">{description}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

/**
 * Delete confirmation. When Django refuses (409: the record is in use) the
 * dialog explains why and, if given, offers `onDeactivate` instead. Calls the
 * API directly (not a mutation hook) so a 409 isn't also toasted.
 */
export function DeleteDialog({
  open,
  title,
  name,
  onDelete,
  onDeactivate,
  deactivateLabel = "Set Inactive Instead",
  onDeleted,
  onClose,
}: {
  open: boolean;
  title: string;
  name: string;
  onDelete: () => Promise<unknown>;
  onDeactivate?: () => Promise<unknown>;
  deactivateLabel?: string;
  /** Called after a successful delete or deactivation (before `onClose`). */
  onDeleted?: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<"delete" | "deactivate" | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const close = () => {
    setConflict(null);
    onClose();
  };

  const run = async (kind: "delete" | "deactivate") => {
    setPending(kind);
    try {
      if (kind === "delete") await onDelete();
      else await onDeactivate?.();
      qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast.success(kind === "delete" ? `${name} deleted` : `${name} updated`);
      onDeleted?.();
      close();
    } catch (err) {
      if (kind === "delete" && err instanceof ApiError && err.status === 409) setConflict(err.message);
      else toast.error(errorText(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="md"
      footer={
        conflict ? (
          <>
            {onDeactivate && (
              <Button className="flex-1" loading={pending === "deactivate"} onClick={() => run("deactivate")}>
                {deactivateLabel}
              </Button>
            )}
            <Button variant="muted" className={onDeactivate ? undefined : "flex-1"} onClick={close}>
              {onDeactivate ? "Cancel" : "Close"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" className="flex-1" loading={pending === "delete"} onClick={() => run("delete")}>
              Delete
            </Button>
            <Button variant="muted" onClick={close}>
              Cancel
            </Button>
          </>
        )
      }
    >
      {conflict ? (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          <p className="font-semibold mb-1">“{name}” can&apos;t be deleted</p>
          <p>{conflict}</p>
        </div>
      ) : (
        <p className="text-gray-700">
          Delete <span className="font-semibold">“{name}”</span>? This can&apos;t be undone.
        </p>
      )}
    </Modal>
  );
}

/** Small inline label used by the design's compact "Add New …" forms. */
export const miniLabel = "block text-xs font-semibold text-gray-600 mb-1.5";
export const miniInput =
  "px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50";

/** "12.3M" style figure used by the design (Inventory Value, vendor Total Sales). */
export function compactAmount(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
