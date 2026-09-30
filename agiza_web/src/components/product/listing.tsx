import { ChevronLeft, ChevronRight, PackageSearch, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

import type { Category, Paginated, ProductCard } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { categoryHref } from "@/lib/format";
import { publicGet } from "@/lib/server/django";

import { ButtonLink } from "../ui/button";
import { EmptyState } from "../ui/states";
import { ProductGrid } from "./product-card";
import { SortSelect } from "./sort-select";

export type ListingParams = { q?: string; sort?: string; min?: string; max?: string; page?: string; deals?: string; featured?: string; stock?: string };

export const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most popular" },
  { value: "price", label: "Price: low to high" },
  { value: "-price", label: "Price: high to low" },
  { value: "name", label: "Name (A–Z)" },
];

const PAGE_SIZE = 24;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function readParams(sp: Record<string, string | string[] | undefined>): ListingParams {
  return {
    q: one(sp.q).slice(0, 100),
    sort: one(sp.sort),
    min: one(sp.min).replace(/[^\d]/g, ""),
    max: one(sp.max).replace(/[^\d]/g, ""),
    page: one(sp.page).replace(/[^\d]/g, ""),
    deals: one(sp.deals),
    featured: one(sp.featured),
    stock: one(sp.stock),
  };
}

export function hrefWith(path: string, params: ListingParams, changes: Partial<ListingParams>) {
  const merged = { ...params, ...changes };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
  if (qs.get("page") === "1") qs.delete("page");
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * A product listing (shop, category, store): server-rendered from the API with the filters in
 * the URL, so every result page can be shared and indexed. Search runs on the server.
 */
export async function Listing({
  path,
  params,
  scope,
  categories,
  activeCategory,
  title,
}: {
  path: string;
  params: ListingParams;
  scope: { category?: number; store?: string };
  categories?: Category[];
  activeCategory?: number;
  title?: string;
}) {
  const page = Math.max(1, Number(params.page) || 1);
  const data =
    (await publicGet<Paginated<ProductCard>>("products/", {
      ...scope,
      search: params.q,
      ordering: SORTS.some((s) => s.value === params.sort) ? params.sort : "newest",
      min_price: params.min,
      max_price: params.max,
      deals: params.deals ? 1 : undefined,
      featured: params.featured ? 1 : undefined,
      in_stock: params.stock ? 1 : undefined,
      page,
      page_size: PAGE_SIZE,
    }, params.q ? 15 : 60)) /* searches go stale fastest: cache them briefly; an outage shows the error page */ ?? { count: 0, page: 1, page_size: PAGE_SIZE, total_pages: 0, results: [] };

  const filters = (
    <Filters path={path} params={params} categories={categories} activeCategory={activeCategory} />
  );
  const active = [params.q && `“${params.q}”`, params.deals && "Ofa kali", params.featured && "Featured", params.stock && "In stock", (params.min || params.max) && "Price"].filter(Boolean);

  return (
    <div className="grid gap-[30px] lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="space-y-5 [&>*]:bg-canvas [&>*]:p-5">{filters}</div>
      </aside>
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas px-4 py-2.5">
          <p className="text-[14px] text-ink" aria-live="polite">
            {title ? <span className="sr-only">{title}: </span> : null}
            <strong className="font-semibold">{data.count}</strong> {data.count === 1 ? "Product" : "Products"} found
            {active.length ? <span className="text-muted"> for {active.join(", ")}</span> : null}
          </p>
          <div className="flex items-center gap-2">
            <details className="group relative lg:hidden">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-sm border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="size-4" aria-hidden /> Filters
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-[min(320px,88vw)] space-y-6 border border-line bg-surface p-4 shadow-raised">{filters}</div>
            </details>
            <SortSelect value={params.sort || "newest"} options={SORTS} />
          </div>
        </div>
        {data.results.length ? (
          <>
            <ProductGrid products={data.results} priorityCount={4} className="xl:grid-cols-4 2xl:grid-cols-5" />
            <Pagination path={path} params={params} page={data.page} total={data.total_pages} />
          </>
        ) : (
          <EmptyState
            icon={PackageSearch}
            title={params.q ? "No products match your search" : "No products here yet"}
            text={params.q ? "Check the spelling, try fewer words, or browse the categories." : "Check back soon, or explore the rest of the shop."}
            action={
              <ButtonLink href="/shop" variant="secondary">
                Browse all products
              </ButtonLink>
            }
          />
        )}
      </div>
    </div>
  );
}

function Filters({ path, params, categories, activeCategory }: { path: string; params: ListingParams; categories?: Category[]; activeCategory?: number }) {
  return (
    <>
      {categories?.length ? (
        <nav aria-label="Categories">
          <h2 className="mb-4 border-b border-line-strong/60 pb-3 text-[16px] font-medium tracking-wide text-ink uppercase">Categories</h2>
          <ul className="space-y-0.5">
            <li>
              <Link href={hrefWith("/shop", params, { page: "" })} className={catClass(!activeCategory && path === "/shop")}>
                All products
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={hrefWith(categoryHref(c), params, { page: "" })} className={catClass(activeCategory === c.id)}>
                  {c.name}
                </Link>
                {c.children.length && (activeCategory === c.id || c.children.some((s) => s.id === activeCategory)) ? (
                  <ul className="mt-0.5 mb-1 ml-3 border-l border-line pl-2">
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link href={hrefWith(categoryHref(s), params, { page: "" })} className={catClass(activeCategory === s.id, true)}>
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <form action={path} method="get" className="space-y-2">
        <h2 className="mb-2 border-b border-line-strong/60 pb-3 text-[16px] font-medium tracking-wide text-ink uppercase">Price (TZS)</h2>
        {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
        {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
        <div className="flex items-center gap-2">
          <input name="min" inputMode="numeric" defaultValue={params.min} placeholder="Min" aria-label="Minimum price" className="h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] focus:border-brand focus:outline-none" />
          <span className="text-muted">–</span>
          <input name="max" inputMode="numeric" defaultValue={params.max} placeholder="Max" aria-label="Maximum price" className="h-10 w-full rounded-md border border-line bg-surface px-3 text-[14px] focus:border-brand focus:outline-none" />
        </div>
        <button type="submit" className="h-9 w-full rounded-sm bg-ink text-[14px] font-semibold text-white hover:bg-[#333]">
          Apply
        </button>
      </form>
      <div className="space-y-1.5">
        <h2 className="mb-2 border-b border-line-strong/60 pb-3 text-[16px] font-medium tracking-wide text-ink uppercase">Show</h2>
        <Toggle href={hrefWith(path, params, { deals: params.deals ? "" : "1", page: "" })} on={Boolean(params.deals)} label="Ofa kali deals" />
        <Toggle href={hrefWith(path, params, { featured: params.featured ? "" : "1", page: "" })} on={Boolean(params.featured)} label="Featured" />
        <Toggle href={hrefWith(path, params, { stock: params.stock ? "" : "1", page: "" })} on={Boolean(params.stock)} label="In stock only" />
      </div>
      {params.q || params.min || params.max || params.deals || params.featured || params.stock ? (
        <Link href={path} className="block text-[14px] font-semibold text-primary hover:underline">
          Clear filters
        </Link>
      ) : null}
    </>
  );
}

function Toggle({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-[14px] text-ink" role="checkbox" aria-checked={on}>
      <span className={cn("flex size-4 items-center justify-center rounded-[2px] border", on ? "border-ink bg-ink" : "border-line-strong bg-surface")}>
        {on ? <span className="size-1.5 bg-white" /> : null}
      </span>
      {label}
    </Link>
  );
}

const catClass = (active: boolean, sub = false) =>
  cn(
    "block py-1.5 hover:text-primary",
    sub ? "text-[13px]" : "text-[14px]",
    active ? "font-semibold text-ink" : "text-text",
  );

function Pagination({ path, params, page, total }: { path: string; params: ListingParams; page: number; total: number }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, i) => i + 1).filter((p) => p === 1 || p === total || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-1">
      <PageLink href={page > 1 ? hrefWith(path, params, { page: String(page - 1) }) : null} label="Previous page">
        <ChevronLeft className="size-4" />
      </PageLink>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - pages[i - 1] > 1 ? <span className="px-1 text-muted">…</span> : null}
          <Link
            href={hrefWith(path, params, { page: String(p) })}
            aria-current={p === page ? "page" : undefined}
            className={cn("flex size-10 items-center justify-center rounded-sm text-[14px] font-semibold", p === page ? "bg-yellow text-ink" : "bg-canvas text-ink hover:bg-yellow")}
          >
            {p}
          </Link>
        </span>
      ))}
      <PageLink href={page < total ? hrefWith(path, params, { page: String(page + 1) }) : null} label="Next page">
        <ChevronRight className="size-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const cls = "flex size-10 items-center justify-center rounded-sm bg-canvas";
  return href ? (
    <Link href={href} aria-label={label} className={cn(cls, "text-ink hover:text-primary")}>
      {children}
    </Link>
  ) : (
    <span aria-hidden className={cn(cls, "text-subtle")}>
      {children}
    </span>
  );
}
