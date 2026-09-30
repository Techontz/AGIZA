"use client";

import { Heart } from "lucide-react";

import { useWishlist } from "@/hooks/use-wishlist";
import { cn } from "@/lib/cn";

export function WishlistButton({ productId, name, className, size = "md" }: { productId: number; name: string; className?: string; size?: "md" | "lg" }) {
  const wishlist = useWishlist();
  const saved = wishlist.has(productId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved products` : `Save ${name}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        wishlist.toggle.mutate(productId);
      }}
      className={cn(
        "flex items-center justify-center rounded-full bg-surface/95 shadow-card transition-colors hover:bg-surface",
        size === "lg" ? "size-11" : "size-9",
        className,
      )}
    >
      <Heart className={cn(size === "lg" ? "size-5" : "size-[18px]", saved ? "fill-primary text-primary" : "text-ink")} aria-hidden />
    </button>
  );
}
