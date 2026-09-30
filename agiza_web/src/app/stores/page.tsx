import { Search, Store as StoreIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { StoreCard } from "@/components/store/store-card";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/states";
import type { Paginated, Store } from "@/lib/api/types";
import { publicGet } from "@/lib/server/django";

export const metadata: Metadata = {
  title: "Stores",
  description: "Browse AGIZA's own store and verified Tanzanian sellers. Every store is reviewed by AGIZA before it can sell.",
  alternates: { canonical: "/stores" },
};

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function StoresPage({ searchParams }: Props) {
  const { q = "", page = "1" } = await searchParams;
  const data = (await publicGet<Paginated<Store>>("stores/", { search: q.slice(0, 80), page: Number(page) || 1, page_size: 24 })) ?? {
    count: 0,
    page: 1,
    page_size: 24,
    total_pages: 0,
    results: [],
  };
  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Stores" }]} />
      <div className="mb-10 text-center">
        <h1 className="text-[30px] font-semibold text-ink sm:text-[40px]">Our Stores</h1>
        <p className="mx-auto mt-2 max-w-xl text-[15px] text-muted">AGIZA&apos;s own store and verified Tanzanian sellers — one cart, one checkout, delivered by AGIZA.</p>
        <form action="/stores" className="relative mx-auto mt-6 w-full max-w-md" role="search">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search vendor..."
            aria-label="Search stores"
            className="h-11 w-full rounded-sm border border-line-strong bg-surface pr-3 pl-10 text-[14px] focus:border-ink focus:outline-none"
          />
        </form>
      </div>
      {data.results.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.results.map((s) => (
            <li key={s.slug}>
              <StoreCard store={s} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={StoreIcon} title={q ? "No stores match your search" : "No stores yet"} text={q ? "Try another name." : undefined} />
      )}
      {data.total_pages > 1 ? (
        <nav className="mt-8 flex justify-center gap-2" aria-label="Pages">
          {Array.from({ length: data.total_pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/stores?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`}
              aria-current={p === data.page ? "page" : undefined}
              className={`flex size-10 items-center justify-center rounded-sm text-[14px] font-semibold ${p === data.page ? "bg-yellow text-ink" : "bg-canvas text-ink hover:bg-yellow"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="mt-12 flex flex-col items-start gap-3 rounded-lg bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Have a shop? Sell on AGIZA</h2>
          <p className="text-muted">Apply in minutes. AGIZA reviews every store before it goes live.</p>
        </div>
        <ButtonLink href="/sell">Start selling</ButtonLink>
      </div>
    </Container>
  );
}
