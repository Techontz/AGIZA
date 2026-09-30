"use client";

import { Heart } from "lucide-react";

import { useWishlist } from "@/hooks/use-wishlist";
import { cn } from "@/lib/cn";

export function WishlistButton({ productId, name, className, size = "md", reveal }: { productId: number; name: string; className?: string; size?: "md" | "lg"; reveal?: boolean }) {
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
        "flex items-center justify-center rounded-full bg-surface/95 shadow-card transition-[colors,opacity] hover:bg-surface",
        size === "lg" ? "size-11" : "size-9",
        // On product cards the heart shows on hover (desktop) unless the product is saved.
        reveal && !saved && "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
        className,
      )}
    >
      <Heart className={cn(size === "lg" ? "size-5" : "size-[18px]", saved ? "fill-sale text-sale" : "text-ink")} aria-hidden />
    </button>
  );
}
