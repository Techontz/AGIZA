import { ChevronRight, MapPin, PackageSearch, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { BuyBox } from "@/components/product/buy-box";
import { CompareButton } from "@/components/product/compare-button";
import { Gallery } from "@/components/product/gallery";
import { ProductReviews } from "@/components/product/reviews";
import { RatingCount } from "@/components/product/stars";
import { ProductTabs } from "@/components/product/tabs";
import { WishlistButton } from "@/components/product/wishlist-button";
import { ProductRow } from "@/components/product/product-card";
import { StoreAvatar, Verified } from "@/components/store/store-avatar";
import { Container } from "@/components/ui/container";
import { BlockTitle } from "@/components/ui/states";
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

      {/* agizastore.com: photos | details and buying | the service box */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_290px]">
        <Gallery images={product.images} name={product.name} />

        <div>
          <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0">
              <h1 className="text-[22px] leading-[1.2] font-normal text-ink sm:text-[24px]">{product.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
                {product.brand ? (
                  <span>
                    Brand: <span className="text-link">{product.brand}</span>
                  </span>
                ) : null}
                <a href="#tab-reviews" className="hover:text-ink">
                  <RatingCount rating={product.rating} count={product.rating_count} className="text-[13px]" />
                </a>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <WishlistButton productId={product.id} name={product.name} size="lg" className="ring-1 ring-line" />
              <CompareButton productId={product.id} name={product.name} size="lg" className="ring-1 ring-line" />
            </div>
          </div>

          <div className="py-5">
            <BuyBox product={product} />
          </div>

          <table className="w-full border-t border-line text-[14px]">
            <tbody>
              <Spec label="Condition" value={product.condition_display} />
              {product.brand ? <Spec label="Brand" value={product.brand} /> : null}
              <Spec label="Category" value={product.category} />
              <Spec
                label="Sold by"
                value={
                  <Link href={storeHref(seller)} className="inline-flex items-center gap-1 text-link hover:underline">
                    {seller.name}
                    {seller.verified ? <Verified label={seller.is_agiza ? "Official AGIZA store" : "Verified seller"} /> : null}
                  </Link>
                }
              />
              {product.variants[0]?.sku ? <Spec label="SKU" value={product.variants[0].sku} /> : null}
              {product.labels.length ? <Spec label="Tags" value={product.labels.map((l) => l.name).join(", ")} /> : null}
            </tbody>
          </table>
        </div>

        <aside className="self-start bg-bar p-5 lg:col-span-2 xl:col-span-1" aria-label="Delivery and services">
          <ul className="space-y-5 text-[14px] text-ink">
            <li className="flex gap-4">
              <Truck className="size-7 shrink-0 stroke-[1.4]" aria-hidden />
              <span>
                {product.ships_from
                  ? `Imported from ${product.ships_from}: shipped to Tanzania, then delivered by AGIZA to your address. Use “Calculate delivery” for the cost and time.`
                  : "Delivered by AGIZA across Tanzania. Use “Calculate delivery” for the cost to your city."}
                {product.ready_to_ship_days > 0 ? ` Ready to ship in ${product.ready_to_ship_days} day${product.ready_to_ship_days === 1 ? "" : "s"}.` : ""}
              </span>
            </li>
            <li className="flex gap-4">
              <ShieldCheck className="size-7 shrink-0 stroke-[1.4]" aria-hidden />
              <span>
                {product.ships_from
                  ? "Paid when you order, with mobile money or card: AGIZA buys it abroad once your payment is confirmed."
                  : "Pay securely with mobile money or card, or pay AGIZA on delivery."}
              </span>
            </li>
            <li className="flex gap-4">
              <RotateCcw className="size-7 shrink-0 stroke-[1.4]" aria-hidden />
              <span>
                Problem with an order? Ask for a return from your account.{" "}
                <Link href="/returns-policy" className="text-link hover:underline">
                  Return policy
                </Link>
              </span>
            </li>
            <li className="flex gap-4">
              <PackageSearch className="size-7 shrink-0 stroke-[1.4]" aria-hidden />
              <span>Track every order from payment to delivery.</span>
            </li>
          </ul>
          <Link href={storeHref(seller)} className="mt-6 flex items-center gap-3 border-t border-line-strong/50 pt-5">
            <StoreAvatar seller={seller} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-muted">Sold by</span>
              <span className="block truncate text-[15px] font-semibold text-ink">{seller.name}</span>
              {seller.city ? (
                <span className="flex items-center gap-1 text-[12px] text-muted">
                  <MapPin className="size-3" aria-hidden /> {seller.city}
                </span>
              ) : null}
            </span>
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
        </aside>
      </div>

      <div className="mt-12 xl:max-w-[calc(100%-320px)]">
        <ProductTabs
          tabs={[
            {
              id: "description",
              label: "Description",
              content: product.description ? (
                <div className="text-[14px] leading-[1.7] whitespace-pre-line text-text">
                  {product.description}
                  {product.condition_description ? <p className="mt-4 text-muted">Condition: {product.condition_description}</p> : null}
                </div>
              ) : (
                <p className="text-[14px] text-muted">The seller hasn&apos;t added a description yet.</p>
              ),
            },
            ...(product.specifications.length
              ? [
                  {
                    id: "specifications",
                    label: "Specifications",
                    content: (
                      <table className="w-full max-w-2xl text-[14px]">
                        <tbody>
                          {product.specifications.map((s) => (
                            <Spec key={s.name} label={s.name} value={s.value} />
                          ))}
                        </tbody>
                      </table>
                    ),
                  },
                ]
              : []),
            {
              id: "reviews",
              label: `Reviews (${product.rating_count})`,
              content: <ProductReviews productId={product.id} productName={product.name} />,
            },
          ]}
        />
      </div>

      {more.length ? (
        <section className="mt-14">
          <BlockTitle
            title={`More from ${seller.name}`}
            action={
              <Link href={storeHref(seller)} className="text-[14px] text-muted hover:text-ink">
                Visit store
              </Link>
            }
          />
          <ProductRow products={more.slice(0, 6)} />
        </section>
      ) : null}
    </Container>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b border-line">
      <th scope="row" className="w-[40%] py-2 pr-4 text-left align-top font-semibold text-ink">
        {label}
      </th>
      <td className="py-2 text-ink">{value}</td>
    </tr>
  );
}
