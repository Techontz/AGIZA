import {
  ArrowRight,
  BadgeCheck,
  Globe,
  Headphones,
  PackageSearch,
  ShieldCheck,
  Smartphone,
  Store as StoreIcon,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { ProductRow } from "@/components/product/product-card";
import { StoreCard } from "@/components/store/store-card";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SectionTitle } from "@/components/ui/states";
import type { Category, Paginated, ProductCard, Store } from "@/lib/api/types";
import { categoryIcon } from "@/lib/category-icons";
import { categoryHref } from "@/lib/format";
import { publicGet } from "@/lib/server/django";
import { ANDROID_APP_URL, IOS_APP_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

import { HeroSearch } from "./hero-search";

export const revalidate = 60;

const EMPTY = { count: 0, page: 1, page_size: 0, total_pages: 0, results: [] };

async function safe<T>(promise: Promise<T | null>, fallback: T): Promise<T> {
  try {
    return (await promise) ?? fallback;
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  const [deals, featured, popular, latest, stores, categories] = await Promise.all([
    safe(publicGet<Paginated<ProductCard>>("products/", { deals: 1, page_size: 10 }), EMPTY),
    safe(publicGet<Paginated<ProductCard>>("products/", { featured: 1, page_size: 10 }), EMPTY),
    safe(publicGet<Paginated<ProductCard>>("products/", { ordering: "popular", page_size: 10 }), EMPTY),
    safe(publicGet<Paginated<ProductCard>>("products/", { ordering: "newest", page_size: 10 }), EMPTY),
    safe(publicGet<Paginated<Store>>("stores/", { page_size: 8 }), { ...EMPTY, results: [] as Store[] }),
    safe(publicGet<Category[]>("categories/", undefined, 300), [] as Category[]),
  ]);

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

      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <Container className="grid items-center gap-8 py-8 sm:py-12 lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:py-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-[13px] font-medium text-primary">
              <Truck className="size-4" aria-hidden /> Delivery across Tanzania
            </p>
            <h1 className="mt-4 text-[28px] leading-[1.15] font-bold text-ink sm:text-[36px] lg:text-[40px]">
              Shop AGIZA and Tanzania&apos;s trusted stores in one cart
            </h1>
            <p className="mt-3 max-w-xl text-[16px] text-muted sm:text-[17px]">
              Phones, electronics, fashion and home goods — priced clearly, paid your way and delivered by AGIZA.
            </p>
            <HeroSearch />
            {categories.length ? (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Popular categories">
                {categories.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={categoryHref(c)}
                      className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:border-brand hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <ServiceCard href="/buy-for-me" icon={Globe} title="Buy for me" text="We buy from China, Dubai, the USA, the UK and India and ship it to you." />
            <ServiceCard href="/deliver-for-me" icon={Truck} title="Deliver for me" text="Already bought abroad? We clear it and bring it to your door." />
            <ServiceCard href="/stores" icon={StoreIcon} title="Shop by store" text="Browse verified Tanzanian sellers and AGIZA's own store." />
            <ServiceCard href="/account/orders" icon={PackageSearch} title="Track orders" text="Follow every order from payment to delivery." />
          </div>
        </Container>
      </section>

      <Container className="space-y-12 py-10 sm:space-y-14 sm:py-12">
        {categories.length ? (
          <section>
            <SectionTitle title="Shop by category" action={<SeeAll href="/shop" />} />
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {categories.slice(0, 12).map((c) => {
                const Icon = categoryIcon(c.name);
                return (
                  <li key={c.id}>
                    <Link
                      href={categoryHref(c)}
                      className="group flex h-full flex-col items-center gap-2 rounded-lg bg-surface px-2 py-4 text-center shadow-card transition-shadow hover:shadow-raised"
                    >
                      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                        <Icon className="size-6" aria-hidden />
                      </span>
                      <span className="text-[13px] leading-tight font-medium text-ink">{c.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {deals.results.length ? <ProductSection title="Ofa kali" href="/shop?deals=1" products={deals.results} /> : null}
        {featured.results.length ? <ProductSection title="Featured" href="/shop?featured=1" products={featured.results} /> : null}
        {popular.results.length ? <ProductSection title="Popular right now" href="/shop?sort=popular" products={popular.results} /> : null}
        {latest.results.length ? (
          <ProductSection title="New arrivals" href="/shop?sort=newest" products={latest.results} />
        ) : (
          <p className="rounded-lg bg-surface p-6 text-center text-muted shadow-card">New products will appear here soon.</p>
        )}

        {stores.results.length ? (
          <section>
            <SectionTitle title="Stores on AGIZA" action={<SeeAll href="/stores" label="All stores" />} />
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {stores.results.slice(0, 8).map((s) => (
                <li key={s.slug}>
                  <StoreCard store={s} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-label="Why shop with AGIZA" className="grid gap-3 rounded-lg bg-surface p-5 shadow-card sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <Highlight icon={Truck} title="Delivered by AGIZA" text="Riders in the city, trusted partners upcountry. The fee is shown before you pay." />
          <Highlight icon={Wallet} title="Pay your way" text="Mobile money or card at checkout, or pay AGIZA on delivery." />
          <Highlight icon={BadgeCheck} title="Checked sellers" text="Every store is reviewed by AGIZA before it can sell." />
          <Highlight icon={Headphones} title="Real support" text="Chat with the AGIZA team about any order." />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col justify-between gap-6 rounded-lg bg-ink p-6 text-white sm:p-8">
            <div>
              <p className="text-[13px] font-semibold tracking-wide text-amber uppercase">Sell on AGIZA</p>
              <h2 className="mt-2 text-2xl font-bold">Reach customers across Tanzania</h2>
              <p className="mt-2 max-w-md text-[15px] text-white/75">
                List your products, get orders from the AGIZA app and website, and let AGIZA handle payment and delivery.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/sell" size="lg" icon={<StoreIcon className="size-5" />}>
                Start selling
              </ButtonLink>
              <ButtonLink href="/sell#how" size="lg" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/15">
                How it works
              </ButtonLink>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-6 rounded-lg bg-primary-soft p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface text-brand shadow-card">
                <Smartphone className="size-6" aria-hidden />
              </span>
              <div>
                <h2 className="text-2xl font-bold text-ink">AGIZA on your phone</h2>
                <p className="mt-2 max-w-md text-[15px] text-muted">
                  The same stores, cart and orders in the AGIZA app — with delivery updates as notifications.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {ANDROID_APP_URL ? (
                <ButtonLink href={ANDROID_APP_URL} variant="dark" size="lg">
                  Get it on Google Play
                </ButtonLink>
              ) : null}
              {IOS_APP_URL ? (
                <ButtonLink href={IOS_APP_URL} variant="dark" size="lg">
                  Download on the App Store
                </ButtonLink>
              ) : null}
              {!ANDROID_APP_URL && !IOS_APP_URL ? (
                <p className="flex items-center gap-2 text-[14px] text-muted">
                  <ShieldCheck className="size-4 text-success" aria-hidden /> Your account works on the website and the app.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </Container>
    </>
  );
}

function SeeAll({ href, label = "See all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 text-[14px] font-semibold text-primary hover:underline">
      {label} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

function ProductSection({ title, href, products }: { title: string; href: string; products: ProductCard[] }) {
  return (
    <section>
      <SectionTitle title={title} action={<SeeAll href={href} />} />
      <ProductRow products={products} />
    </section>
  );
}

function ServiceCard({ href, icon: Icon, title, text }: { href: string; icon: typeof Globe; title: string; text: string }) {
  return (
    <Link href={href} className="group flex flex-col gap-1.5 rounded-lg bg-surface p-4 shadow-card ring-1 ring-line transition-shadow hover:shadow-raised sm:p-5">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary-soft text-brand">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-[16px] font-semibold text-ink group-hover:text-primary">{title}</span>
      <span className="text-[13px] leading-[18px] text-muted">{text}</span>
    </Link>
  );
}

function Highlight({ icon: Icon, title, text }: { icon: typeof Globe; title: string; text: string }) {
  return (
    <div className="flex gap-3 p-1">
      <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-[13px] text-muted">{text}</p>
      </div>
    </div>
  );
}
