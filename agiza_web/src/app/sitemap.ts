import type { MetadataRoute } from "next";

import type { Category, Paginated, ProductCard, Store } from "@/lib/api/types";
import { categoryHref, productHref, storeHref } from "@/lib/format";
import { publicGet } from "@/lib/server/django";
import { absolute } from "@/lib/site";

export const revalidate = 3600;

const MAX_PAGES = 50; // 5,000 products; split into several sitemaps if the catalogue grows past that

async function all<T>(path: string, query: Record<string, string | number> = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await publicGet<Paginated<T>>(path, { ...query, page, page_size: 100 }, 3600).catch(() => null);
    if (!data) break;
    rows.push(...data.results);
    if (page >= data.total_pages) break;
  }
  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, stores, categories] = await Promise.all([
    all<ProductCard>("products/"),
    all<Store>("stores/"),
    publicGet<Category[]>("categories/", undefined, 3600).catch(() => null),
  ]);
  const fixed = ["/", "/shop", "/stores", "/buy-for-me", "/deliver-for-me", "/sell", "/about", "/contact", "/faq", "/privacy", "/terms", "/marketplace-terms", "/vendor-terms", "/returns-policy", "/delivery-policy", "/cookies"];
  return [
    ...fixed.map((path) => ({ url: absolute(path), changeFrequency: "weekly" as const, priority: path === "/" ? 1 : 0.6 })),
    ...(categories ?? []).flatMap((c) => [c, ...c.children]).map((c) => ({ url: absolute(categoryHref(c)), changeFrequency: "daily" as const, priority: 0.7 })),
    ...stores.map((s) => ({ url: absolute(storeHref(s)), changeFrequency: "daily" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: absolute(productHref(p)), lastModified: p.created_at, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
