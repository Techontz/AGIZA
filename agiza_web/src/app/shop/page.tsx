import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { Listing, readParams } from "@/components/product/listing";
import { Container } from "@/components/ui/container";
import type { Category } from "@/lib/api/types";
import { publicGet } from "@/lib/server/django";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = readParams(await searchParams);
  if (q) {
    // Search result pages are useful to visitors but not as search-engine landing pages.
    return { title: `Search: ${q}`, robots: { index: false, follow: true }, alternates: { canonical: "/shop" } };
  }
  return {
    title: "Shop all products",
    description: "Browse every product on AGIZA — from AGIZA itself and verified Tanzanian stores — with prices in TZS.",
    alternates: { canonical: "/shop" },
  };
}

export default async function ShopPage({ searchParams }: Props) {
  const params = readParams(await searchParams);
  const categories = (await publicGet<Category[]>("categories/", undefined, 300).catch(() => null)) ?? [];
  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: params.q ? `Search results` : "Shop" }]} />
      <h1 className="mb-5 text-2xl font-bold text-ink sm:text-[28px]">{params.q ? `Results for “${params.q}”` : "All products"}</h1>
      <Listing path="/shop" params={params} scope={{}} categories={categories} title="All products" />
    </Container>
  );
}
