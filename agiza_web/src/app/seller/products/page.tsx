"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Package, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ProductImage } from "@/components/product/product-image";
import { ListingBadge } from "@/components/seller/listing-badge";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";
import { date, money } from "@/lib/format";

export default function SellerProducts() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["seller", "products", search, page], queryFn: () => sellerApi.products({ search, page }), placeholderData: keepPreviousData });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Products</h1>
        <ButtonLink href="/seller/products/new" icon={<PackagePlus className="size-4" />}>
          Add product
        </ButtonLink>
      </div>
      <Input
        placeholder="Search your products by name or SKU"
        aria-label="Search your products"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-md"
      />
      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.isError ? (
        <Notice tone="danger">{errorMessage(list.error)}</Notice>
      ) : !list.data?.results.length ? (
        <EmptyState icon={Package} title={search ? "No products match" : "No products yet"} text={search ? undefined : "Add your first product. AGIZA reviews it before it goes live."} />
      ) : (
        <div className="overflow-hidden rounded-lg bg-surface shadow-card">
          <ul className="divide-y divide-line">
            {list.data.results.map((p) => (
              <li key={p.id}>
                <Link href={`/seller/products/${p.id}`} className="flex items-center gap-4 p-4 hover:bg-canvas">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-tile">
                    <ProductImage src={p.image} alt="" sizes="56px" iconClass="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{p.name}</span>
                    <span className="block text-[13px] text-muted">
                      {p.sku} · {p.category_name} · updated {date(p.updated_at)}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <ListingBadge state={p.listing_state} />
                      <span className={p.available <= 3 ? "text-[13px] font-medium text-warning" : "text-[13px] text-muted"}>{p.available} available</span>
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-ink tabular-nums">{money(p.price)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {list.data.total_pages > 1 ? (
            <div className="flex items-center justify-between border-t border-line p-3 text-[14px]">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="font-semibold text-primary disabled:text-subtle">
                ← Previous
              </button>
              <span className="text-muted">
                Page {list.data.page} of {list.data.total_pages}
              </span>
              <button type="button" disabled={page >= list.data.total_pages} onClick={() => setPage(page + 1)} className="font-semibold text-primary disabled:text-subtle">
                Next →
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
