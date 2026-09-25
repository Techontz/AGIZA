import { cn } from "@/lib/cn";

/** `bg-white rounded-lg shadow-sm border border-gray-200`: the design's standard card. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("bg-white rounded-lg shadow-sm border border-gray-200", className)} {...props} />;
}
