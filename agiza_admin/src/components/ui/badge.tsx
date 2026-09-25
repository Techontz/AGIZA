import { cn } from "@/lib/cn";

import type { Tone } from "./stat-card";

const tones: Record<Tone | "emerald" | "amber" | "teal" | "pink", string> = {
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
  purple: "bg-purple-100 text-purple-800",
  yellow: "bg-yellow-100 text-yellow-800",
  indigo: "bg-indigo-100 text-indigo-800",
  cyan: "bg-cyan-100 text-cyan-800",
  gray: "bg-gray-100 text-gray-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  teal: "bg-teal-100 text-teal-800",
  pink: "bg-pink-100 text-pink-800",
};

export type BadgeTone = keyof typeof tones;

/**
 * Status pill (`px-3 py-1 rounded-full text-xs font-medium`) or, with
 * `square`, the design's type/priority tag (`px-2 py-1 rounded`).
 */
export function Badge({
  tone = "gray",
  square,
  className,
  children,
}: {
  tone?: BadgeTone;
  square?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 text-xs font-medium whitespace-nowrap",
        square ? "px-2 py-1 rounded" : "px-3 py-1 rounded-full",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
