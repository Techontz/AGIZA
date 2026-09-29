import { CalendarDays, MapPin, Package, Star } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { Listing, readParams } from "@/components/product/listing";
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
      <section className="border-b border-line bg-surface">
        <div className="relative h-28 w-full overflow-hidden bg-primary-soft sm:h-40">
          {store.banner ? (
            <Image src={store.banner} alt="" fill priority sizes="100vw" className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,var(--color-amber)_0,transparent_45%)] opacity-30" aria-hidden />
          )}
        </div>
        <Container className="pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <StoreAvatar seller={store} size={96} className="relative z-10 -mt-12 border-4 border-surface shadow-card" />
              <div className="sm:pb-1">
                <h1 className="flex items-center gap-2 text-[24px] leading-tight font-bold text-ink sm:text-[28px]">
                  {store.name}
                  {store.verified ? <Verified className="size-6" label={store.is_agiza ? "Official AGIZA store" : "Verified seller"} /> : null}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
                  {store.is_agiza ? <span className="font-medium text-primary">Official AGIZA store</span> : store.verified ? <span>Verified seller</span> : null}
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
                  {store.rating ? (
                    <span className="flex items-center gap-1">
                      <Star className="size-4 fill-amber text-amber" aria-hidden /> {store.rating}
                    </span>
                  ) : null}
                  {store.joined ? (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-4" aria-hidden /> On AGIZA since {date(store.joined)}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
          {store.description ? <p className="mt-4 max-w-3xl text-[15px] whitespace-pre-line text-text">{store.description}</p> : null}
        </Container>
      </section>
      <Container className="py-6 sm:py-8">
        <Breadcrumbs items={[{ label: "Stores", href: "/stores" }, { label: store.name }]} />
        <form action={storeHref(store)} role="search" className="mb-5 max-w-md">
          <input
            name="q"
            defaultValue={listing.q}
            placeholder={`Search in ${store.name}`}
            aria-label={`Search in ${store.name}`}
            className="h-11 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] focus:border-brand focus:ring-3 focus:ring-primary-soft focus:outline-none"
          />
        </form>
        <Listing path={storeHref(store)} params={listing} scope={{ store: store.slug }} title={`${store.name} products`} />
      </Container>
    </>
  );
}
