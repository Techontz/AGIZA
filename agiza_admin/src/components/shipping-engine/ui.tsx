"use client";

/**
 * Shipping Engine primitives, reproduced from docs/.../ShippingEngine.tsx
 * (StatusBadge, PageHeader, StatCard, Btn, SectionCard, FormField, Input,
 * Select, Textarea, Tabs, modal shell). The engine deliberately uses a lighter
 * style than the rest of the admin (rounded-xl, no shadow, text-2xl titles).
 */
import { ArrowRight, Loader2, MoreHorizontal, XCircle, type LucideIcon } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------- badges */

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-500",
  pending: "bg-yellow-100 text-yellow-700",
  draft: "bg-blue-100 text-blue-700",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={cn(
        "px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-500",
      )}
    >
      {label ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/** "Origin → Destination" chips used in route/rule tables. */
export function RouteChips({ origin, destination, size = "md" }: { origin: string; destination: string; size?: "sm" | "md" }) {
  const chip = size === "sm" ? "bg-gray-100 px-1.5 py-0.5 rounded" : "bg-gray-100 px-2 py-0.5 rounded text-xs font-medium";
  return (
    <span className={cn("flex items-center gap-1", size === "sm" && "text-xs")}>
      <span className={chip}>{origin}</span>
      <ArrowRight className="size-3 text-gray-400 flex-shrink-0" />
      <span className={chip}>{destination}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- layout */

export function EnginePage({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-4 sm:p-6", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

const STAT_COLORS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
  yellow: "bg-yellow-50 text-yellow-700",
  red: "bg-red-50 text-red-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  color = "blue",
  loading,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  color?: keyof typeof STAT_COLORS;
  loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={cn("p-3 rounded-lg", STAT_COLORS[color])}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 leading-snug">{label}</p>
        {loading ? (
          <div className="h-8 w-10 mt-0.5 animate-pulse rounded bg-gray-200" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function InfoBanner({
  tone = "blue",
  icon: Icon,
  children,
  className,
}: {
  tone?: "blue" | "yellow";
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  const styles =
    tone === "yellow"
      ? { box: "bg-yellow-50 border-yellow-200", icon: "text-yellow-700", text: "text-yellow-800" }
      : { box: "bg-blue-50 border-blue-200", icon: "text-blue-600", text: "text-blue-800" };
  return (
    <div className={cn("border rounded-xl p-4 flex items-start gap-3", styles.box, className)}>
      <Icon className={cn("size-4 mt-0.5 flex-shrink-0", styles.icon)} />
      <div className={cn("text-sm", styles.text)}>{children}</div>
    </div>
  );
}

/* --------------------------------------------------------------- buttons */

const BTN_VARIANTS = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export const Btn = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof BTN_VARIANTS;
    icon?: LucideIcon;
    size?: "sm" | "md";
    loading?: boolean;
  }
>(function Btn({ variant = "primary", icon: Icon, size = "md", loading, className, children, type = "button", disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        BTN_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn(size === "sm" ? "size-3.5" : "size-4", "animate-spin")} />
      ) : (
        Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
      )}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(size === "sm" ? "p-1 rounded" : "p-2 rounded-lg", "hover:bg-gray-100 transition-colors disabled:opacity-40", className)}
      {...props}
    >
      <Icon className={cn(size === "sm" ? "size-3.5" : "size-4", "text-gray-400")} />
    </button>
  );
}

/** The design's MoreHorizontal button, opening a small action menu. */
export function RowMenu({
  items,
  size = "md",
}: {
  items: { label: string; onClick: () => void; danger?: boolean; hidden?: boolean }[];
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;
  return (
    <div className="relative" ref={ref}>
      <IconButton icon={MoreHorizontal} label="More actions" size={size} onClick={() => setOpen((v) => !v)} aria-expanded={open} />
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
          {visible.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-gray-50",
                item.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- forms */

const FIELD =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500";

export function FormField({
  label,
  required,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD, invalid && "border-red-400", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, ...props }, ref) {
    return <select ref={ref} className={cn(FIELD, "bg-white", invalid && "border-red-400", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD, "resize-none", className)} {...props} />;
  },
);

/** "Section N — Title" label used inside the rule form. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{children}</p>;
}

/** Two-state option buttons (route type, applies-to, pricing model). */
export function ToggleOption({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "py-2 px-3 rounded-lg border text-sm font-medium transition-colors text-center",
        selected ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Switch replacing the design's CSS-only pseudo toggle (which could not turn off). */
export function Toggle({ checked, onChange, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; id?: string; disabled?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex w-11 h-6 flex-shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-blue-600" : "bg-gray-300",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 bg-white rounded-full shadow transition-all",
          checked ? "left-5" : "left-0.5",
        )}
      />
    </button>
  );
}

/* ----------------------------------------------------------------- tabs */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap",
            active === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- modal */

export function EngineModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  size?: "lg" | "xl" | "2xl";
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  const width = { lg: "max-w-lg", xl: "max-w-xl", "2xl": "max-w-2xl" }[size];
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("bg-white rounded-2xl w-full shadow-2xl max-h-[90vh] flex flex-col", width)}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id={titleId} className="font-semibold text-gray-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <XCircle className="size-5 text-gray-400" />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-6 space-y-4 overflow-y-auto">{children}</div>
        <div className="flex flex-wrap justify-end gap-3 px-6 py-4 border-t border-gray-100">{footer}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
  loading,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <EngineModal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <p className="text-sm text-gray-600">{message}</p>
    </EngineModal>
  );
}

/* ------------------------------------------------------------ list states */

export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
          <div className="size-10 rounded-lg bg-gray-100 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-56 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-80 max-w-full rounded bg-gray-100 animate-pulse" />
            <div className="h-5 w-64 max-w-full rounded bg-gray-100 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EngineEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center text-gray-400">
      <Icon className="size-10 mx-auto mb-3 text-gray-200" />
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** Table cell classes from the design: `text-left text-xs font-medium text-gray-500 px-4 py-3`. */
export const th = "text-left text-xs font-medium text-gray-500 px-4 py-3 whitespace-nowrap";
export const td = "px-4 py-3";
