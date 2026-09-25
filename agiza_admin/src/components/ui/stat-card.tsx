import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

export type Tone = "blue" | "green" | "orange" | "red" | "purple" | "yellow" | "indigo" | "cyan" | "gray";

const valueTone: Record<Tone, string> = {
  blue: "text-blue-600",
  green: "text-green-600",
  orange: "text-orange-600",
  red: "text-red-600",
  purple: "text-purple-600",
  yellow: "text-yellow-600",
  indigo: "text-indigo-600",
  cyan: "text-cyan-600",
  gray: "text-gray-900",
};

const iconTone: Record<Tone, string> = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-green-100 text-green-600",
  orange: "bg-orange-100 text-orange-600",
  red: "bg-red-100 text-red-600",
  purple: "bg-purple-100 text-purple-600",
  yellow: "bg-yellow-100 text-yellow-600",
  indigo: "bg-indigo-100 text-indigo-600",
  cyan: "bg-cyan-100 text-cyan-600",
  gray: "bg-gray-100 text-gray-600",
};

/** Summary card from the Figma screens (label, coloured count, icon in a tinted circle). */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  loading,
  compactValue,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  loading?: boolean;
  /** Money totals use text-2xl in the design. */
  compactValue?: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{label}</p>
          {loading ? (
            <div className="h-9 w-16 animate-pulse rounded bg-gray-200" />
          ) : (
            <p className={cn(compactValue ? "text-2xl" : "text-3xl", "font-bold", valueTone[tone])}>{value}</p>
          )}
        </div>
        <div className={cn("p-3 rounded-full", iconTone[tone])}>
          <Icon className="size-6" />
        </div>
      </div>
    </Card>
  );
}
