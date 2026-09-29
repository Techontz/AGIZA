"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/cn";

export function QuantityStepper({
  value,
  max,
  onChange,
  disabled,
  size = "md",
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-8" : "h-11";
  const btn = size === "sm" ? "w-8" : "w-10";
  return (
    <div className={cn("inline-flex items-center rounded-md border border-line bg-surface", box)}>
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        className={cn("flex h-full items-center justify-center text-ink disabled:text-subtle", btn)}
      >
        <Minus className="size-4" />
      </button>
      <span className="min-w-8 text-center text-[15px] font-semibold text-ink tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className={cn("flex h-full items-center justify-center text-ink disabled:text-subtle", btn)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
