import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { Listing, readParams } from "@/components/product/listing";
import { Container } from "@/components/ui/container";
import type { Category } from "@/lib/api/types";
import { categoryHref } from "@/lib/format";
import { publicGet } from "@/lib/server/django";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function find(slug: string) {
  const categories = (await publicGet<Category[]>("categories/", undefined, 300)) ?? [];
  for (const c of categories) {
    if (c.slug === slug) return { categories, category: { id: c.id, name: c.name, slug: c.slug, description: c.description }, parent: null };
    const child = c.children.find((s) => s.slug === slug);
    if (child) return { categories, category: { ...child, description: "" }, parent: c };
  }
  return { categories, category: null, parent: null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, parent } = await find((await params).slug);
  if (!category) return { title: "Category not found" };
  const name = parent ? `${category.name} (${parent.name})` : category.name;
  return {
    title: `${category.name} — shop online in Tanzania`,
    description: category.description || `Shop ${name} on AGIZA from AGIZA and verified Tanzanian stores, delivered across Tanzania.`,
    alternates: { canonical: categoryHref(category) },
    openGraph: { title: `${category.name} · AGIZA`, url: categoryHref(category) },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { categories, category, parent } = await find(slug);
  if (!category) notFound();
  const listing = readParams(await searchParams);
  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs
        items={[
          { label: "Shop", href: "/shop" },
          ...(parent ? [{ label: parent.name, href: categoryHref(parent) }] : []),
          { label: category.name },
        ]}
      />
      <h1 className="text-[24px] font-medium text-ink sm:text-[28px]">{category.name}</h1>
      {category.description ? <p className="mt-1 max-w-2xl text-muted">{category.description}</p> : null}
      <div className="mt-5">
        <Listing path={categoryHref(category)} params={listing} scope={{ category: category.id }} categories={categories} activeCategory={category.id} title={category.name} />
      </div>
    </Container>
  );
}
