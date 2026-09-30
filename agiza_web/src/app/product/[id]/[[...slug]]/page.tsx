import { ChevronRight, MapPin, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { BuyBox } from "@/components/product/buy-box";
import { Gallery } from "@/components/product/gallery";
import { ProductReviews } from "@/components/product/reviews";
import { RatingInline } from "@/components/product/stars";
import { WishlistButton } from "@/components/product/wishlist-button";
import { ProductRow } from "@/components/product/product-card";
import { StoreAvatar, Verified } from "@/components/store/store-avatar";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { SectionTitle } from "@/components/ui/states";
import type { Paginated, ProductCard, ProductDetail } from "@/lib/api/types";
import { productHref, slugify, storeHref } from "@/lib/format";
import { publicGet } from "@/lib/server/django";
import { absolute } from "@/lib/site";

export const revalidate = 60;

type Props = { params: Promise<{ id: string; slug?: string[] }> };

async function load(id: string) {
  if (!/^\d+$/.test(id)) return null;
  return publicGet<ProductDetail>(`products/${id}/`);
}

function summary(p: ProductDetail) {
  const text = p.description.replace(/\s+/g, " ").trim();
  const lead = text ? text.slice(0, 150) + (text.length > 150 ? "…" : "") : `${p.name} from ${p.vendor.name}.`;
  return `${lead} Buy online on AGIZA for ${Number(p.price).toLocaleString("en-US")} TZS, delivered across Tanzania.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await load((await params).id);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const url = productHref(product);
  return {
    title: `${product.name}${product.brand ? ` · ${product.brand}` : ""}`,
    description: summary(product),
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: product.name,
      description: summary(product),
      images: product.images.length ? product.images.slice(0, 4).map((src) => ({ url: `/_next/image?url=${encodeURIComponent(src)}&w=1024&q=80`, alt: product.name })) : ["/icon.png"],
    },
    twitter: { card: product.images.length ? "summary_large_image" : "summary" },
  };
}

export default async function ProductPage({ params }: Props) {
  const { id, slug } = await params;
  const product = await load(id);
  if (!product) notFound();
  const canonicalSlug = slugify(product.name) || "item";
  if (slug?.[0] !== canonicalSlug || (slug?.length ?? 0) > 1) permanentRedirect(productHref(product));

  const more =
    (await publicGet<Paginated<ProductCard>>("products/", { store: product.vendor.slug, page_size: 11 }).catch(() => null))?.results.filter(
      (p) => p.id !== product.id,
    ) ?? [];
  const inStock = product.variants.some((v) => v.available > 0);
  const seller = product.vendor;

  return (
    <Container className="py-6 sm:py-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description || summary(product),
          sku: product.variants[0]?.sku,
          ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
          category: product.category,
          image: product.images.map((src) => absolute(`/_next/image?url=${encodeURIComponent(src)}&w=1024&q=80`)),
          itemCondition: `https://schema.org/${product.condition === "new" ? "NewCondition" : product.condition === "refurbished" ? "RefurbishedCondition" : "UsedCondition"}`,
          offers: {
            "@type": "Offer",
            url: absolute(productHref(product)),
            priceCurrency: "TZS",
            price: product.price,
            availability: `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`,
            seller: { "@type": "Organization", name: seller.name, url: absolute(storeHref(seller)) },
          },
          ...(product.rating_count
            ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.rating_count } }
            : {}),
        }}
      />
      <Breadcrumbs
        items={[
          { label: "Shop", href: "/shop" },
          { label: product.category, href: `/shop?q=${encodeURIComponent(product.category)}` },
          { label: product.name },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        <Gallery images={product.images} name={product.name} />

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {product.brand ? <Badge>{product.brand}</Badge> : null}
              <Badge tone={product.condition === "new" ? "success" : "warning"}>{product.condition_display}</Badge>
              {product.ofa_kali ? <Badge tone="brand">Ofa kali</Badge> : null}
              {product.labels.map((l) => (
                <Badge key={l.name} tone="info">
                  {l.name}
                </Badge>
              ))}
            </div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[24px] leading-tight font-bold text-ink sm:text-[28px]">{product.name}</h1>
              <WishlistButton productId={product.id} name={product.name} size="lg" className="shrink-0 ring-1 ring-line" />
            </div>
            <RatingInline rating={product.rating} count={product.rating_count} className="text-[13px]" />
          </div>

          <Link
            href={storeHref(seller)}
            className="group flex items-center gap-3 rounded-lg bg-surface p-3.5 shadow-card ring-1 ring-line transition-shadow hover:shadow-raised"
          >
            <StoreAvatar seller={seller} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-muted">Sold by</span>
              <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink group-hover:text-primary">
                <span className="truncate">{seller.name}</span>
                {seller.verified ? <Verified label={seller.is_agiza ? "Official AGIZA store" : "Verified seller"} /> : null}
              </span>
              {seller.city ? (
                <span className="flex items-center gap-1 text-[12px] text-muted">
                  <MapPin className="size-3" aria-hidden /> {seller.city}
                </span>
              ) : seller.is_agiza ? (
                <span className="text-[12px] text-muted">Official AGIZA store</span>
              ) : null}
            </span>
            <span className="flex items-center gap-0.5 text-[13px] font-semibold text-primary">
              Visit store <ChevronRight className="size-4" aria-hidden />
            </span>
          </Link>

          <BuyBox product={product} />

          <ul className="space-y-3 rounded-lg bg-surface p-4 text-[14px] shadow-card">
            <li className="flex gap-3">
              <Truck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="font-semibold text-ink">Delivery by AGIZA.</span>{" "}
                <span className="text-muted">
                  Options and the exact fee for your address are calculated at checkout
                  {product.shipping_methods.length ? ` (${product.shipping_methods.join(", ")})` : ""}.
                  {product.ready_to_ship_days > 0 ? ` Ready to ship in ${product.ready_to_ship_days} day${product.ready_to_ship_days === 1 ? "" : "s"}.` : ""}
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <span className="text-muted">
                <span className="font-semibold text-ink">Pay securely:</span> mobile money or card at checkout, or pay AGIZA on delivery.
              </span>
            </li>
            <li className="flex gap-3">
              <RotateCcw className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <span className="text-muted">
                <span className="font-semibold text-ink">Problem with an order?</span> Ask for a return from your account; AGIZA handles it with the seller.{" "}
                <Link href="/returns-policy" className="font-medium text-primary hover:underline">
                  Return policy
                </Link>
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        {product.description ? (
          <section className="rounded-lg bg-surface p-5 shadow-card sm:p-6">
            <h2 className="mb-3 text-lg font-semibold text-ink">Description</h2>
            <div className="text-[15px] leading-relaxed whitespace-pre-line text-text">{product.description}</div>
            {product.condition_description ? <p className="mt-4 text-[14px] text-muted">Condition: {product.condition_description}</p> : null}
          </section>
        ) : (
          <div />
        )}
        {product.specifications.length ? (
          <section className="rounded-lg bg-surface p-5 shadow-card sm:p-6">
            <h2 className="mb-3 text-lg font-semibold text-ink">Specifications</h2>
            <dl className="divide-y divide-line">
              {product.specifications.map((s) => (
                <div key={s.name} className="flex justify-between gap-4 py-2.5 text-[14px]">
                  <dt className="text-muted">{s.name}</dt>
                  <dd className="text-right font-medium text-ink">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      <div className="mt-6">
        <ProductReviews productId={product.id} productName={product.name} />
      </div>

      {more.length ? (
        <section className="mt-12">
          <SectionTitle
            title={`More from ${seller.name}`}
            action={
              <Link href={storeHref(seller)} className="text-[14px] font-semibold text-primary hover:underline">
                Visit store →
              </Link>
            }
          />
          <ProductRow products={more.slice(0, 10)} />
        </section>
      ) : null}
    </Container>
  );
}
