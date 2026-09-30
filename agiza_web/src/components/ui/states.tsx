import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-line/70", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 border border-line bg-surface px-6 py-12 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-canvas text-ink">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {text ? <p className="max-w-md text-[15px] text-muted">{text}</p> : null}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "danger" | "warning" | "success"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-info-soft text-info",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md px-3.5 py-2.5 text-[14px]", tones[tone], className)}>
      {children}
    </div>
  );
}

export function Card({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={cn("border border-line bg-surface p-4 sm:p-5", className)}>{children}</Tag>;
}

/** The grey section bar of agizastore.com: title on the left, links ("View all", tabs) on the right. */
export function SectionTitle({ title, action, className, as: Tag = "h2" }: { title: string; action?: ReactNode; className?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className={cn("mb-4 flex min-h-[53px] flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#e3e3e3] bg-canvas px-4 py-3 sm:px-5", className)}>
      <Tag className="text-[18px] leading-tight font-medium text-ink sm:text-[20px]">{title}</Tag>
      {action}
    </div>
  );
}

/** A plain heading with an underline, for secondary blocks ("Related products", "Top categories"). */
export function BlockTitle({ title, action, className, as: Tag = "h2" }: { title: string; action?: ReactNode; className?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className={cn("mb-5 flex items-end justify-between gap-3 border-b border-line pb-3", className)}>
      <Tag className="text-[18px] font-semibold text-ink sm:text-[20px]">{title}</Tag>
      {action}
    </div>
  );
}

export function Row({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className={strong ? "font-semibold text-ink" : "text-muted"}>{label}</span>
      <span className={cn("text-right", strong ? "font-semibold text-ink" : "font-medium text-ink")}>{value}</span>
    </div>
  );
}
