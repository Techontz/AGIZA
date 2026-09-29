import Link from "next/link";

import type { ProductCard as Product } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { money, productHref } from "@/lib/format";

import { Verified } from "../store/store-avatar";
import { Badge } from "../ui/badge";
import { ProductImage } from "./product-image";

const GRID_SIZES = "(min-width: 1280px) 240px, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw";

/** The app's product tile, on the web: square photo, seller, two-line name, price. */
export function ProductCard({ product, priority, sizes = GRID_SIZES, className }: { product: Product; priority?: boolean; sizes?: string; className?: string }) {
  const range = product.price !== product.price_max;
  const compare =
    product.compare_at_price && Number(product.compare_at_price) > Number(product.price) ? product.compare_at_price : null;
  const off = compare ? Math.round((1 - Number(product.price) / Number(compare)) * 100) : 0;
  return (
    <Link
      href={productHref(product)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg bg-surface shadow-card transition-[box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:shadow-raised focus-visible:-translate-y-0.5",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-tile">
        <ProductImage
          src={product.image}
          alt={product.name}
          sizes={sizes}
          priority={priority}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {!product.in_stock ? (
            <Badge>Out of stock</Badge>
          ) : product.ofa_kali ? (
            <Badge tone="brand">Ofa kali</Badge>
          ) : off >= 5 ? (
            <Badge tone="brand">−{off}%</Badge>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="flex min-w-0 items-center gap-1 text-[12px] leading-4 text-muted">
          <span className="truncate">{product.vendor.name}</span>
          {product.vendor.verified && !product.vendor.is_agiza ? <Verified className="size-3.5" /> : null}
        </p>
        <h3 className="line-clamp-2 min-h-9 text-[13px] leading-[18px] font-medium text-ink sm:text-[14px] sm:leading-5 sm:min-h-10">{product.name}</h3>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2">
          <span className="text-[16px] leading-[22px] font-semibold text-ink tabular-nums">
            {range ? `From ${money(product.price)}` : money(product.price)}
          </span>
          {compare ? <span className="text-[12px] text-subtle line-through tabular-nums">{money(compare)}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products, priorityCount = 0, className }: { products: Product[]; priorityCount?: number; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <ProductCard product={p} priority={i < priorityCount} className="w-full" />
        </li>
      ))}
    </ul>
  );
}

/** A horizontal row on phones (like the app), a grid from tablets up. */
export function ProductRow({ products }: { products: Product[] }) {
  return (
    <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => (
        <li key={p.id} className="flex w-[44vw] max-w-[190px] shrink-0 snap-start sm:w-auto sm:max-w-none">
          <ProductCard product={p} className="w-full" sizes="(min-width: 1280px) 240px, (min-width: 640px) 30vw, 44vw" />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-lg bg-surface shadow-card">
          <div className="aspect-square animate-pulse bg-tile" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-1/2 animate-pulse rounded bg-line/70" />
            <div className="h-4 w-full animate-pulse rounded bg-line/70" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-line/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}
