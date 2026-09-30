"use client";

import { useQueries } from "@tanstack/react-query";
import { ChartColumnBig, X } from "lucide-react";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProductImage } from "@/components/product/product-image";
import { RatingCount } from "@/components/product/stars";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { useCompare } from "@/hooks/use-compare";
import { errorMessage } from "@/lib/api/client";
import { shopApi } from "@/lib/api/endpoints";
import type { ProductDetail } from "@/lib/api/types";
import { money, productHref, storeHref } from "@/lib/format";

/** Side-by-side comparison of up to four products, read from the catalogue API. */
export function CompareView() {
  const compare = useCompare();
  const results = useQueries({ queries: compare.ids.map((id) => ({ queryKey: ["product", id], queryFn: () => shopApi.product(id), staleTime: 60_000 })) });
  const products = results.map((r) => r.data).filter((p): p is ProductDetail => Boolean(p));
  const loading = results.some((r) => r.isLoading);
  const failed = results.find((r) => r.isError);
  const specNames = [...new Set(products.flatMap((p) => p.specifications.map((s) => s.name)))];

  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Compare" }]} />
      <h1 className="text-center text-[28px] font-semibold text-ink sm:text-[36px]">Compare products</h1>
      {!compare.ids.length ? (
        <EmptyState
          className="mt-8"
          icon={ChartColumnBig}
          title="Nothing to compare yet"
          text="Use the compare button on products to see up to four of them side by side."
          action={<ButtonLink href="/shop">Browse products</ButtonLink>}
        />
      ) : loading ? (
        <Skeleton className="mt-8 h-96" />
      ) : (
        <>
          {failed ? <Notice tone="danger" className="mt-6">{errorMessage(failed.error)}</Notice> : null}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse border border-line text-[14px]">
              <tbody>
                <tr>
                  <th scope="row" className="w-40 border border-line bg-canvas p-3 text-left align-top font-semibold text-ink">Product</th>
                  {products.map((p) => (
                    <td key={p.id} className="relative border border-line p-3 align-top">
                      <button
                        type="button"
                        onClick={() => compare.remove(p.id)}
                        aria-label={`Remove ${p.name} from compare`}
                        className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-muted hover:bg-canvas hover:text-ink"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                      <Link href={productHref(p)} className="block">
                        <span className="relative mx-auto block aspect-square w-full max-w-[180px]">
                          <ProductImage src={p.images[0] ?? p.image} alt={p.name} sizes="180px" className="object-contain" />
                        </span>
                        <span className="mt-2 block text-link hover:underline">{p.name}</span>
                      </Link>
                    </td>
                  ))}
                </tr>
                <Line label="Price" products={products} value={(p) => <span className="text-[16px] text-ink">{money(p.price)}</span>} />
                <Line label="Rating" products={products} value={(p) => <RatingCount rating={p.rating} count={p.rating_count} />} />
                <Line
                  label="Sold by"
                  products={products}
                  value={(p) => (
                    <Link href={storeHref(p.vendor)} className="text-link hover:underline">
                      {p.vendor.name}
                    </Link>
                  )}
                />
                <Line label="Availability" products={products} value={(p) => (p.in_stock ? <span className="text-success">In stock</span> : <span className="text-danger">Out of stock</span>)} />
                <Line label="Condition" products={products} value={(p) => p.condition_display} />
                <Line label="Brand" products={products} value={(p) => p.brand || "—"} />
                <Line label="Category" products={products} value={(p) => p.category} />
                {specNames.map((name) => (
                  <Line key={name} label={name} products={products} value={(p) => p.specifications.find((s) => s.name === name)?.value ?? "—"} />
                ))}
                <Line
                  label=""
                  products={products}
                  value={(p) => (
                    <ButtonLink href={productHref(p)} size="sm" className="w-full">
                      View product
                    </ButtonLink>
                  )}
                />
              </tbody>
            </table>
          </div>
          <button type="button" onClick={compare.clear} className="mt-4 text-[14px] text-link hover:underline">
            Clear comparison
          </button>
        </>
      )}
    </Container>
  );
}

function Line({ label, products, value }: { label: string; products: ProductDetail[]; value: (p: ProductDetail) => React.ReactNode }) {
  return (
    <tr>
      <th scope="row" className="border border-line bg-canvas p-3 text-left align-top font-semibold text-ink">
        {label}
      </th>
      {products.map((p) => (
        <td key={p.id} className="border border-line p-3 align-top text-ink">
          {value(p)}
        </td>
      ))}
    </tr>
  );
}
