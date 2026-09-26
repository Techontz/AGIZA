"use client";

import { X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef } from "react";

import { cn } from "@/lib/cn";

/* The product editor's compact controls (px-3 py-2 text-sm), as in the design. */
const control =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500";
const invalidCls = "border-red-400 focus:ring-red-500";

export const FI = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function FI({ className, invalid, ...props }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(control, invalid && invalidCls, className)} {...props} />;
  },
);

export const FS = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function FS({ className, invalid, ...props }, ref) {
    return <select ref={ref} aria-invalid={invalid || undefined} className={cn(control, invalid && invalidCls, className)} {...props} />;
  },
);

export const FTA = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function FTA({ className, invalid, ...props }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(control, "resize-none", invalid && invalidCls, className)} {...props} />;
  },
);

/** Labelled field: label, control, hint or (in red) the API's field error. */
export function SI({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>
      )}
    </div>
  );
}

export function SecHead({ n, title, id }: { n: number; title: string; id?: string }) {
  return (
    <div id={id} className="flex items-center gap-3 pt-5 pb-3 border-t border-gray-100">
      <span className="size-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <h3 className="font-semibold text-gray-800">{title}</h3>
    </div>
  );
}

/** Yes / No radio pair bound to a boolean. */
export function YesNo({
  name,
  value,
  onChange,
  label,
  disabled,
  className,
  gap = "gap-2",
}: {
  name: string;
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  gap?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex items-center gap-4", className)}>
      {[true, false].map((v) => (
        <label
          key={String(v)}
          className={cn("flex items-center text-sm text-gray-700", gap, disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer")}
        >
          <input
            type="radio"
            name={name}
            checked={value === v}
            disabled={disabled}
            onChange={() => onChange(v)}
            className="text-blue-600"
          />
          {v ? "Yes" : "No"}
        </label>
      ))}
    </div>
  );
}

/** Removable chip used by the product pickers and keyword lists. */
export function Chip({ children, onRemove, label }: { children: React.ReactNode; onRemove?: () => void; label: string }) {
  return (
    <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm flex items-center gap-1.5 max-w-full">
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="text-gray-400 hover:text-red-500">
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}

/**
 * Dialog shell matching the design's editor modals: the whole panel scrolls,
 * with sticky header and footer. Escape closes it only when it's the topmost dialog.
 */
export function EditorDialog({
  onClose,
  title,
  subtitle,
  footer,
  children,
  width = "max-w-3xl",
  maxHeight = "max-h-[94vh]",
  layer = "z-50 bg-black/50",
}: {
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  maxHeight?: string;
  layer?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] === panel.current) close.current();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div className={cn("fixed inset-0 flex items-center justify-center p-2 sm:p-4", layer)} onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn("bg-white rounded-xl w-full overflow-y-auto shadow-2xl focus:outline-none", width, maxHeight)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 z-10 rounded-t-xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close">
            <X className="size-5 text-gray-400" />
          </button>
        </div>
        {children}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4 flex gap-3 rounded-b-xl z-10">{footer}</div>
      </div>
    </div>
  );
}

/** Sub-heading used inside the variation modal ("Identity", "Pricing" ...). */
export function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {title} {note && <span className="normal-case font-normal text-gray-400">({note})</span>}
      </p>
      {children}
    </div>
  );
}
