import Link from "next/link";

import type { ProductCard as Product } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { money, productHref } from "@/lib/format";

import { Verified } from "../store/store-avatar";
import { CompareButton } from "./compare-button";
import { ProductImage } from "./product-image";
import { RatingCount } from "./stars";
import { WishlistButton } from "./wishlist-button";

const GRID_SIZES = "(min-width: 1280px) 230px, (min-width: 1024px) 24vw, (min-width: 640px) 30vw, 46vw";

/**
 * The agizastore.com product tile: square photo on white, a label in the corner, the name as a
 * blue link, stars and the price (red with the old price struck through on a sale). The seller
 * is a quiet line under the name.
 */
export function ProductCard({ product, priority, sizes = GRID_SIZES, className }: { product: Product; priority?: boolean; sizes?: string; className?: string }) {
  const range = product.price !== product.price_max;
  const compare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price) ? product.compare_at_price : null;
  const off = compare ? Math.round((1 - Number(product.price) / Number(compare)) * 100) : 0;
  return (
    <div className={cn("group relative flex flex-col border border-transparent bg-surface p-[10px] transition-colors hover:border-line-strong sm:p-[15px]", className)}>
      <Link href={productHref(product)} className="flex flex-1 flex-col outline-none">
        <div className="relative aspect-square overflow-hidden bg-surface">
          <ProductImage src={product.image} alt={product.name} sizes={sizes} priority={priority} className="object-contain" />
          <div className="absolute top-0 left-0 flex flex-col items-start gap-1">
            {!product.in_stock ? (
              <Label className="bg-[#666] text-white">Out of stock</Label>
            ) : off >= 1 ? (
              <Label className="bg-[#d42a00] text-white">−{off}%</Label>
            ) : product.ofa_kali ? (
              <Label className="bg-yellow text-ink">Ofa kali</Label>
            ) : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col pt-2.5">
          <h3 className="line-clamp-2 min-h-[34px] text-[14px] leading-[17px] text-link group-hover:underline">{product.name}</h3>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[12px] leading-4 text-muted">
            <span className="truncate">{product.vendor.name}</span>
            {product.vendor.verified && !product.vendor.is_agiza ? <Verified className="size-3" /> : null}
          </p>
          <RatingCount rating={product.rating} count={product.rating_count} className="mt-1" />
          <p className={cn("mt-1.5 text-[16px] leading-[22px] tabular-nums", compare ? "text-[#d42a00]" : "text-ink")}>
            {range ? `From ${money(product.price)}` : money(product.price)}
          </p>
          {compare ? <p className="text-[14px] leading-5 text-muted line-through tabular-nums">{money(compare)}</p> : null}
        </div>
      </Link>
      <div className="absolute top-2 right-2 flex flex-col gap-1.5 sm:top-3 sm:right-3">
        <WishlistButton productId={product.id} name={product.name} reveal />
        <CompareButton productId={product.id} name={product.name} reveal className="max-lg:hidden" />
      </div>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-sm px-2.5 py-1 text-[13px] leading-4 font-semibold", className)}>{children}</span>;
}

export function ProductGrid({ products, priorityCount = 0, className }: { products: Product[]; priorityCount?: number; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <ProductCard product={p} priority={i < priorityCount} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

/** A section row as on agizastore.com: six products across on desktop, a swipeable row on phones. */
export function ProductRow({ products }: { products: Product[] }) {
  return (
    <ul className="no-scrollbar -mx-[15px] flex snap-x overflow-x-auto px-[5px] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-6">
      {products.slice(0, 12).map((p, i) => (
        <li key={p.id} className={cn("flex w-[46vw] max-w-[220px] shrink-0 snap-start sm:w-auto sm:max-w-none", i >= 6 && "sm:hidden", i >= 4 && "lg:max-xl:hidden")}>
          <ProductCard product={p} className="w-full" sizes="(min-width: 1280px) 230px, (min-width: 1024px) 24vw, (min-width: 640px) 30vw, 46vw" />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="p-[15px]">
          <div className="aspect-square animate-pulse bg-canvas" />
          <div className="space-y-2 pt-3">
            <div className="h-4 w-full animate-pulse bg-canvas" />
            <div className="h-4 w-2/3 animate-pulse bg-canvas" />
            <div className="h-4 w-1/3 animate-pulse bg-canvas" />
          </div>
        </li>
      ))}
    </ul>
  );
}
