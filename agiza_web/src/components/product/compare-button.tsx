"use client";

import { ChartColumnBig } from "lucide-react";

import { useCompare } from "@/hooks/use-compare";
import { cn } from "@/lib/cn";

export function CompareButton({ productId, name, className, size = "md", reveal }: { productId: number; name: string; className?: string; size?: "md" | "lg"; reveal?: boolean }) {
  const compare = useCompare();
  const on = compare.has(productId);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from compare` : `Compare ${name}`}
      title={on ? "Remove from compare" : "Compare"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        compare.toggle(productId);
      }}
      className={cn(
        "flex items-center justify-center rounded-full bg-surface/95 shadow-card transition-[colors,opacity] hover:bg-surface",
        size === "lg" ? "size-11" : "size-9",
        reveal && !on && "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
        className,
      )}
    >
      <ChartColumnBig className={cn(size === "lg" ? "size-5" : "size-[18px]", on ? "text-link" : "text-ink")} aria-hidden />
    </button>
  );
}
