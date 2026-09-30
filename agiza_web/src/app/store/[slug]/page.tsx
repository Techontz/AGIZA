import { CalendarDays, MapPin, Package } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { Listing, readParams } from "@/components/product/listing";
import { RatingCount } from "@/components/product/stars";
import { StoreAvatar, Verified } from "@/components/store/store-avatar";
import { Container } from "@/components/ui/container";
import type { Store } from "@/lib/api/types";
import { date, plural, storeHref } from "@/lib/format";
import { publicGet } from "@/lib/server/django";
import { absolute } from "@/lib/site";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

async function load(slug: string) {
  if (!/^[\w-]+$/.test(slug)) return null;
  return publicGet<Store>(`stores/${slug}/`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await load((await params).slug);
  if (!store) return { title: "Store not found", robots: { index: false } };
  const description =
    store.description?.slice(0, 160) ||
    `Shop ${store.name}${store.city ? ` (${store.city})` : ""} on AGIZA. ${store.products_count ?? 0} products, delivered across Tanzania.`;
  return {
    title: `${store.name} — store`,
    description,
    alternates: { canonical: storeHref(store) },
    openGraph: { title: `${store.name} on AGIZA`, description, url: storeHref(store), images: store.logo ? [store.logo] : ["/icon.png"] },
  };
}

export default async function StorePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const store = await load(slug);
  if (!store) notFound();
  const listing = readParams(await searchParams);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Store",
          name: store.name,
          url: absolute(storeHref(store)),
          ...(store.description ? { description: store.description } : {}),
          ...(store.logo ? { logo: absolute(store.logo), image: absolute(store.logo) } : {}),
          ...(store.city ? { address: { "@type": "PostalAddress", addressLocality: store.city, addressCountry: "TZ" } } : {}),
        }}
      />
      <Container className="py-6 sm:py-8">
        <Breadcrumbs items={[{ label: "Stores", href: "/stores" }, { label: store.name }]} />
        {/* The store header, in the site's flat style: banner, then logo, name, rating and facts. */}
        <section className="border border-line">
          <div className="relative h-32 w-full overflow-hidden bg-canvas sm:h-48">
            {store.banner ? <Image src={store.banner} alt="" fill priority sizes="(min-width: 1650px) 1590px, 100vw" className="object-cover" /> : null}
          </div>
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <StoreAvatar seller={store} size={104} className="relative z-10 -mt-16 border-4 border-surface sm:-mt-20" />
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-[24px] leading-tight font-medium text-ink sm:text-[28px]">
                  {store.name}
                  {store.verified ? <Verified className="size-6" label={store.is_agiza ? "Official AGIZA store" : "Verified seller"} /> : null}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
                  <RatingCount rating={store.rating} count={store.rating_count ?? 0} className="text-[13px]" />
                  {store.is_agiza ? <span className="font-medium text-ink">Official AGIZA store</span> : store.verified ? <span>Verified seller</span> : null}
                  {store.city ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-4" aria-hidden /> {store.city}
                    </span>
                  ) : null}
                  {store.products_count !== null ? (
                    <span className="flex items-center gap-1">
                      <Package className="size-4" aria-hidden /> {plural(store.products_count, "product")}
                    </span>
                  ) : null}
                  {store.joined ? (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-4" aria-hidden /> On AGIZA since {date(store.joined)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <form action={storeHref(store)} role="search" className="flex h-[42px] w-full border border-line-strong lg:w-[360px]">
              <input
                name="q"
                defaultValue={listing.q}
                placeholder={`Search in ${store.name}`}
                aria-label={`Search in ${store.name}`}
                className="min-w-0 flex-1 bg-surface px-4 text-[14px] focus:outline-none"
              />
              <button type="submit" className="bg-ink px-5 text-[14px] font-bold text-white hover:bg-[#333]">
                Search
              </button>
            </form>
          </div>
          {store.description ? <p className="border-t border-line px-5 py-4 text-[14px] whitespace-pre-line text-text">{store.description}</p> : null}
        </section>
        <div className="mt-8">
          <Listing path={storeHref(store)} params={listing} scope={{ store: store.slug }} title={`${store.name} products`} />
        </div>
      </Container>
    </>
  );
}
