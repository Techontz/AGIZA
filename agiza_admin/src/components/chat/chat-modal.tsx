"use client";

import { X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Modal shell of the Transaction Chat design (`rounded-xl shadow-2xl`,
 * blurred backdrop, slate header). Escape and backdrop click close it.
 */
export function ChatModal({
  open,
  onClose,
  title,
  size = "sm",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  const titleId = useId();
  const close = useRef(onClose);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", handler);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" }[size];
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("bg-white rounded-xl shadow-2xl w-full max-h-[90vh] flex flex-col outline-none", width)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id={titleId} className="text-slate-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="size-5 text-slate-500" />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Option row used by the follow-up / escalate / reassign / link modals. */
export function OptionButton({
  icon: Icon,
  label,
  sub,
  trailing,
  onClick,
  disabled,
  pending,
  selected,
}: {
  icon?: LucideIcon;
  label: React.ReactNode;
  sub?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(
        "w-full flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-left",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900",
        selected && "border-slate-900 bg-slate-50",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <Icon className="size-5 text-slate-600 flex-shrink-0" />}
        <div className="min-w-0">
          <div className="text-sm text-slate-900 truncate">{label}</div>
          {sub && <div className="text-xs text-slate-600 truncate">{sub}</div>}
        </div>
      </div>
      {pending ? <span className="size-4 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin flex-shrink-0" aria-hidden /> : trailing}
    </button>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "size-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center text-white flex-shrink-0",
        className,
      )}
      aria-hidden
    >
      <span className="text-sm">{(name.trim().charAt(0) || "?").toUpperCase()}</span>
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {message}
    </p>
  );
}

export const slateInput =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 text-slate-900 placeholder:text-slate-400";

export const primaryBtn =
  "px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed";

export const secondaryBtn =
  "px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed";
