import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "yellow";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // agizastore.com: the main action is black ("Add to cart"), the second one yellow ("Buy now").
  primary: "bg-ink text-white border-ink hover:bg-[#333] hover:border-[#333]",
  yellow: "bg-yellow text-ink border-yellow hover:bg-yellow-pressed hover:border-yellow-pressed",
  secondary: "bg-surface text-ink border-line-strong hover:border-ink",
  ghost: "bg-transparent text-primary border-transparent hover:bg-canvas",
  danger: "bg-surface text-danger border-danger hover:bg-danger-soft",
  dark: "bg-ink text-white border-ink hover:bg-[#333]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-sm",
  md: "h-11 px-5 text-[15px] gap-2 rounded-sm",
  lg: "h-[50px] px-[30px] text-[17px] gap-2 rounded-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center border font-semibold whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-55",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link {...props} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}
