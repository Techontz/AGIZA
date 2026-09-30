import { Star } from "lucide-react";

import { cn } from "@/lib/cn";

/** A read-only star rating (the value always comes from the server). */
export function Stars({ value, size = 14, className }: { value: number | string | null; size?: number; className?: string }) {
  const v = Number(value ?? 0);
  return (
    <span className={cn("inline-flex items-center gap-px", className)} role="img" aria-label={`Rated ${v.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, v - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }} aria-hidden>
            <Star className="absolute inset-0 text-line-strong" style={{ width: size, height: size }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="fill-amber text-amber" style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function RatingInline({ rating, count, className }: { rating: string | null; count: number; className?: string }) {
  if (!count || !rating) return null;
  return (
    <span className={cn("flex items-center gap-1 text-[12px] text-muted", className)}>
      <Stars value={rating} size={12} />
      <span className="font-medium text-ink">{rating}</span>
      <span>({count})</span>
    </span>
  );
}
