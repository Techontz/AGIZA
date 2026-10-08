import { Globe, Smartphone, Store as StoreIcon, Truck } from "lucide-react";
import Link from "next/link";

import { BannerCarousel } from "@/components/home/banner-carousel";
import { JsonLd } from "@/components/json-ld";
import { ProductImage } from "@/components/product/product-image";
import { ProductRow } from "@/components/product/product-card";
import { StoreCard } from "@/components/store/store-card";
import { Container } from "@/components/ui/container";
import { BlockTitle, SectionTitle } from "@/components/ui/states";
import type { Category, HomePage as HomePayload, HomeSection, Paginated, ProductCard, Store } from "@/lib/api/types";
import { categoryIcon } from "@/lib/category-icons";
import { categoryHref } from "@/lib/format";
import { publicGet } from "@/lib/server/django";
import { ANDROID_APP_URL, IOS_APP_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const revalidate = 60;

type Page<T> = Paginated<T>;
const EMPTY = { count: 0, page: 1, page_size: 0, total_pages: 0, results: [] };

async function safe<T>(promise: Promise<T | null>, fallback: T): Promise<T> {
  try {
    return (await promise) ?? fallback;
  } catch {
    return fallback;
  }
}

const products = (query: Record<string, string | number>) => safe(publicGet<Page<ProductCard>>("products/", { page_size: 12, ...query }), EMPTY as Page<ProductCard>);

/**
 * The agizastore.com home page. Staff arrange its sections in the admin (E-commerce → Website
 * Homepage): banners, product rows, the AGIZA services, top categories, department rows and stores,
 * served in order by /app/home/. Until that endpoint answers, the built-in layout below is used.
 */
export default async function HomePage() {
  const home = await safe(publicGet<HomePayload>("home/"), null);
  const sections = home?.sections ?? [];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icon.png` },
            {
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
              description: SITE_DESCRIPTION,
              publisher: { "@id": `${SITE_URL}/#org` },
              potentialAction: {
                "@type": "SearchAction",
                target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/shop?q={search_term_string}` },
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }}
      />
      <h1 className="sr-only">AGIZA — shop AGIZA and trusted Tanzanian stores, delivered across Tanzania</h1>

      <Container className="space-y-10 pt-6 sm:space-y-14 sm:pt-10">
        {sections.length ? sections.map((section) => <HomeBlock key={`${section.kind}-${section.id}`} section={section} />) : <DefaultSections />}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col justify-between gap-5 bg-canvas p-6 sm:p-8 xl:flex-row xl:items-center">
            <div>
              <p className="text-[13px] font-semibold tracking-wide text-muted uppercase">Sell on AGIZA</p>
              <h2 className="mt-1 text-[22px] font-semibold text-ink">Open your store with the AGIZA Seller app</h2>
              <p className="mt-1 text-[14px] text-muted">Reach customers on the AGIZA website and app; AGIZA handles payment and delivery.</p>
            </div>
            <Link href="/sell" className="inline-flex h-11 shrink-0 items-center justify-center self-start rounded-sm bg-ink px-6 text-[15px] font-semibold text-white hover:bg-[#333] xl:self-auto">
              Start selling
            </Link>
          </div>
          <div className="flex flex-col justify-between gap-5 bg-yellow p-6 sm:p-8 xl:flex-row xl:items-center">
            <div className="flex gap-4">
              <Smartphone className="mt-1 size-8 shrink-0 text-ink" aria-hidden />
              <div>
                <h2 className="text-[22px] font-semibold text-ink">AGIZA on your phone</h2>
                <p className="mt-1 text-[14px] text-ink/80">The same stores, cart and orders, with delivery updates as notifications.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {ANDROID_APP_URL ? (
                <a href={ANDROID_APP_URL} className="inline-flex h-11 items-center rounded-sm bg-ink px-5 text-[14px] font-semibold text-white hover:bg-[#333]">
                  Google Play
                </a>
              ) : null}
              {IOS_APP_URL ? (
                <a href={IOS_APP_URL} className="inline-flex h-11 items-center rounded-sm bg-ink px-5 text-[14px] font-semibold text-white hover:bg-[#333]">
                  App Store
                </a>
              ) : null}
              {!ANDROID_APP_URL && !IOS_APP_URL ? <p className="text-[14px] font-medium text-ink">Your account works on the website and the app.</p> : null}
            </div>
          </div>
        </section>
      </Container>
    </>
  );
}

/** One staff-managed section; renders nothing when it has no items. */
function HomeBlock({ section }: { section: HomeSection }) {
  switch (section.kind) {
    case "banners":
      return section.banners.length ? (
        <BannerCarousel label={section.title || "Featured offers"} banners={section.banners.map((b) => ({ ...b, image: bannerSrc(b.image) }))} />
      ) : null;
    case "products": {
      if (!section.products.length) return null;
      const title = section.title || section.category?.name || "Products";
      const href = section.category ? categoryHref(section.category) : section.href;
      return <ProductSection title={title} href={href} products={section.products} />;
    }
    case "categories":
      return section.tiles.length ? <CategoryTiles title={section.title || "Top Categories"} tiles={section.tiles} /> : null;
    case "category_rows":
      return section.rows.length ? (
        <>
          {section.rows
            .filter((r) => r.products.length)
            .map(({ category, products: items }) => (
              <ProductSection
                key={category.id}
                title={category.name}
                href={categoryHref(category)}
                products={items}
                links={category.children.slice(0, 3).map((s) => ({ href: categoryHref(s), label: s.name }))}
              />
            ))}
        </>
      ) : null;
    case "services":
      return <Services />;
    case "stores":
      return section.stores.length ? <Stores title={section.title || "Stores on AGIZA"} stores={section.stores} /> : null;
    default:
      return null;
  }
}

/**
 * Banner images are served by Django; the browser loads them from this website (the CSP only
 * allows our own origin), through the cached /img/b/<id> route like product images.
 */
function bannerSrc(url: string): string {
  const match = url.match(/\/api\/app\/sliders\/(\d+)\/image\/?$/);
  return match ? `/img/b/${match[1]}` : url;
}

/**
 * The built-in layout, used when /app/home/ is unavailable (e.g. an API that predates it):
 * rows of products under grey section bars, the AGIZA services, top categories and stores.
 */
async function DefaultSections() {
  const [featured, deals, popular, latest, stores, categories] = await Promise.all([
    products({ featured: 1 }),
    products({ deals: 1 }),
    products({ ordering: "popular" }),
    products({ ordering: "newest" }),
    safe(publicGet<Page<Store>>("stores/", { page_size: 6 }), EMPTY as Page<Store>),
    safe(publicGet<Category[]>("categories/", undefined, 300), [] as Category[]),
  ]);
  // The first row is always full: featured products first, then the newest ones.
  const seen = new Set(featured.results.map((p) => p.id));
  const featuredRow = [...featured.results, ...latest.results.filter((p) => !seen.has(p.id))].slice(0, 12);
  const departments = categories.slice(0, 8);
  const byDepartment = await Promise.all(departments.map((c) => products({ category: c.id })));
  const tiles = departments.map((c, i) => ({ category: c, image: byDepartment[i].results.find((p) => p.image)?.image ?? null, count: byDepartment[i].count }));
  const departmentRows = departments.map((c, i) => ({ category: c, products: byDepartment[i].results })).filter((d) => d.products.length >= 2).slice(0, 3);

  return (
    <>
      {featuredRow.length ? (
        <ProductSection title="Featured products" href={featured.results.length ? "/shop?featured=1" : "/shop?sort=newest"} products={featuredRow} />
      ) : (
        <p className="border border-line p-8 text-center text-muted">New products will appear here soon.</p>
      )}

      {deals.results.length ? <ProductSection title="Ofa kali deals" href="/shop?deals=1" products={deals.results} /> : null}

      <Services />

      {popular.results.length ? <ProductSection title="Popular right now" href="/shop?sort=popular" products={popular.results} /> : null}

      {tiles.length ? <CategoryTiles title="Top Categories" tiles={tiles} /> : null}

      {departmentRows.map(({ category, products: items }) => (
        <ProductSection
          key={category.id}
          title={category.name}
          href={categoryHref(category)}
          products={items}
          links={category.children.slice(0, 3).map((s) => ({ href: categoryHref(s), label: s.name }))}
        />
      ))}

      {latest.results.length && featured.results.length ? <ProductSection title="New arrivals" href="/shop?sort=newest" products={latest.results} /> : null}

      {stores.results.length ? <Stores title="Stores on AGIZA" stores={stores.results.slice(0, 6)} /> : null}
    </>
  );
}

function Services() {
  return (
    <section aria-label="AGIZA services" className="grid gap-4 md:grid-cols-3">
      <Promo href="/buy-for-me" icon={Globe} kicker="Buy for me" title="We buy from abroad for you" text="China, Dubai, the USA, the UK and India — AGIZA buys, ships and delivers." tone="yellow" />
      <Promo href="/deliver-for-me" icon={Truck} kicker="Deliver for me" title="Already bought it abroad?" text="AGIZA collects, clears and delivers it to your door in Tanzania." tone="dark" />
      <Promo href="/stores" icon={StoreIcon} kicker="Stores" title="Shop Tanzania's trusted stores" text="Every store is checked by AGIZA. One cart, one payment, one delivery." tone="grey" />
    </section>
  );
}

function CategoryTiles({ title, tiles }: { title: string; tiles: { category: Category; image: string | null }[] }) {
  return (
    <section>
      <BlockTitle title={title} />
      <ul className="flex flex-wrap justify-center gap-3 sm:gap-5">
        {tiles.map(({ category, image }) => {
          const Icon = categoryIcon(category.name);
          return (
            <li key={category.id} className="w-[calc((100%-24px)/3)] sm:w-[150px]">
              <Link href={categoryHref(category)} className="group block border border-line-strong p-2.5 text-center hover:border-ink">
                <span className="relative block aspect-square overflow-hidden bg-surface">
                  {image ? (
                    <ProductImage src={image} alt="" sizes="(min-width: 1280px) 150px, (min-width: 640px) 22vw, 30vw" className="object-contain" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted">
                      <Icon className="size-10" aria-hidden />
                    </span>
                  )}
                </span>
                <span className="mt-2 block truncate text-[14px] font-medium text-muted group-hover:text-ink sm:text-[15px]">{category.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stores({ title, stores }: { title: string; stores: Store[] }) {
  return (
    <section>
      <SectionTitle title={title} action={<ViewAll href="/stores" />} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((s) => (
          <li key={s.slug}>
            <StoreCard store={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="text-[14px] text-muted hover:text-ink">
      View All
    </Link>
  );
}

function ProductSection({ title, href, products: items, links = [] }: { title: string; href?: string | null; products: ProductCard[]; links?: { href: string; label: string }[] }) {
  return (
    <section>
      <SectionTitle
        title={title}
        action={
          <nav aria-label={`${title} links`} className="flex flex-wrap items-center gap-x-6 gap-y-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hidden text-[14px] text-muted hover:text-ink md:inline">
                {l.label}
              </Link>
            ))}
            {href ? <ViewAll href={href} /> : null}
          </nav>
        }
      />
      <ProductRow products={items} />
    </section>
  );
}

function Promo({ href, icon: Icon, kicker, title, text, tone }: { href: string; icon: typeof Globe; kicker: string; title: string; text: string; tone: "yellow" | "dark" | "grey" }) {
  const tones = { yellow: "bg-yellow text-ink", dark: "bg-ink text-white", grey: "bg-canvas text-ink" };
  return (
    <Link href={href} className={`group flex gap-4 p-6 ${tones[tone]}`}>
      <Icon className="mt-0.5 size-8 shrink-0" aria-hidden />
      <span>
        <span className="block text-[13px] font-semibold tracking-wide uppercase opacity-75">{kicker}</span>
        <span className="mt-1 block text-[19px] leading-snug font-semibold group-hover:underline">{title}</span>
        <span className="mt-1 block text-[14px] opacity-80">{text}</span>
      </span>
    </Link>
  );
}
