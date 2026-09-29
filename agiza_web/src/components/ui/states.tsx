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
    <div className={cn("flex flex-col items-center gap-3 rounded-lg bg-surface px-6 py-12 text-center shadow-card", className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-brand">
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
  return <Tag className={cn("rounded-lg bg-surface p-4 shadow-card sm:p-5", className)}>{children}</Tag>;
}

export function SectionTitle({ title, action, className, as: Tag = "h2" }: { title: string; action?: ReactNode; className?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3 sm:mb-4", className)}>
      <Tag className="text-lg font-semibold text-ink sm:text-xl">{title}</Tag>
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
