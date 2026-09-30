"use client";

import { AlertCircle, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";

import { ProductImage } from "@/components/product/product-image";
import { StoreAvatar, Verified } from "@/components/store/store-avatar";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState, Notice, Row, Skeleton } from "@/components/ui/states";
import { QuantityStepper } from "@/components/ui/stepper";
import { useCart } from "@/hooks/use-cart";
import type { CartLine } from "@/lib/api/types";
import { money, plural, productHref, storeHref } from "@/lib/format";

export function CartView() {
  const cart = useCart();
  const data = cart.data;

  if (!data && (cart.isLoading || cart.isPending)) {
    return (
      <Container className="py-8">
        <Skeleton className="mb-6 h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-72" />
          <Skeleton className="h-56" />
        </div>
      </Container>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <Container className="py-10">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          text="Browse products from AGIZA and trusted stores — you can add items from several stores to one cart."
          action={<ButtonLink href="/shop">Start shopping</ButtonLink>}
        />
      </Container>
    );
  }

  const byVariant = new Map(data.items.map((l) => [l.variant_id, l]));
  const groups = data.groups.length ? data.groups : [{ vendor: data.items[0].vendor, subtotal: data.subtotal, variant_ids: data.items.map((l) => l.variant_id) }];
  const multi = groups.length > 1;

  return (
    <Container className="py-6 sm:py-8">
      <Breadcrumbs items={[{ label: "Shopping Cart" }]} />
      <h1 className="text-center text-[28px] font-semibold text-ink sm:text-[36px]">Shopping Cart</h1>
      <p className="mt-1 text-center text-muted">
        {plural(data.item_count, "item")}
        {multi ? ` from ${groups.length} stores` : ""}
      </p>

      <div className="mt-8 grid items-start gap-[30px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {data.has_issues ? (
            <Notice tone="warning">Some items are unavailable or low on stock. Update them to continue to checkout.</Notice>
          ) : null}
          {groups.map((g) => (
            <section key={g.vendor.slug} className="border border-line bg-surface" aria-label={`Items from ${g.vendor.name}`}>
              <header className="flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3">
                <Link href={storeHref(g.vendor)} className="flex min-w-0 items-center gap-2.5 hover:text-primary">
                  <StoreAvatar seller={g.vendor} size={30} />
                  <span className="truncate text-[15px] font-semibold text-ink">{g.vendor.name}</span>
                  {g.vendor.verified && !g.vendor.is_agiza ? <Verified /> : null}
                </Link>
                {multi ? <span className="shrink-0 text-[14px] text-muted">Subtotal {money(g.subtotal)}</span> : null}
              </header>
              <ul className="divide-y divide-line">
                {g.variant_ids.map((vid) => {
                  const line = byVariant.get(vid);
                  return line ? <Line key={vid} line={line} /> : null;
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-32">
          <div className="bg-bar p-6">
            <h2 className="mb-3 border-b border-line-strong/50 pb-3 text-[18px] font-semibold text-ink">Cart totals</h2>
            {multi
              ? groups.map((g) => <Row key={g.vendor.slug} label={g.vendor.name} value={money(g.subtotal)} />)
              : null}
            <div className="my-2 border-t border-line" />
            <Row label="Subtotal" value={money(data.subtotal)} strong />
            <p className="mt-1 flex gap-2 text-[13px] text-muted">
              <Truck className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
              Delivery is calculated at checkout for your address{multi ? ", per store that ships your items" : ""}.
            </p>
            <ButtonLink
              href={cart.signedIn ? "/checkout" : "/login?next=/checkout"}
              size="lg"
              variant="yellow"
              className="mt-5 w-full"
              aria-disabled={data.has_issues}
              onClick={(e) => data.has_issues && e.preventDefault()}
            >
              {cart.signedIn ? "Proceed to checkout" : "Sign in to check out"}
            </ButtonLink>
            {!cart.signedIn ? (
              <p className="mt-2 text-center text-[13px] text-muted">
                New to AGIZA?{" "}
                <Link href="/register?next=/checkout" className="font-semibold text-primary hover:underline">
                  Create an account
                </Link>{" "}
                — your cart comes with you.
              </p>
            ) : null}
          </div>
          <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
            <ShieldCheck className="size-4 text-success" aria-hidden /> Prices and stock are checked again when you order.
          </p>
        </aside>
      </div>
    </Container>
  );
}

function Line({ line }: { line: CartLine }) {
  const cart = useCart();
  const max = Math.max(1, Math.min(line.available, 100));
  const busy = cart.setQuantity.isPending || cart.remove.isPending;
  return (
    <li className="flex gap-3 p-4 sm:gap-4">
      <Link href={productHref({ id: line.product_id, name: line.name })} className="relative size-20 shrink-0 overflow-hidden border border-line bg-surface sm:size-24">
        <ProductImage src={line.image} alt={line.name} sizes="96px" iconClass="size-6" className="object-contain" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={productHref({ id: line.product_id, name: line.name })} className="line-clamp-2 text-[15px] text-link hover:underline">
              {line.name}
            </Link>
            {line.variant_name ? <p className="text-[13px] text-muted">{line.variant_name}</p> : null}
          </div>
          <p className="shrink-0 text-[15px] font-semibold text-ink tabular-nums">{money(line.line_total)}</p>
        </div>
        <p className="text-[13px] text-muted">{money(line.unit_price)} each</p>
        {line.issue ? (
          <p className="flex items-center gap-1 text-[13px] font-medium text-danger">
            <AlertCircle className="size-4" aria-hidden /> {line.issue}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          {line.available > 0 ? (
            <QuantityStepper
              size="sm"
              value={Math.min(line.quantity, max)}
              max={max}
              disabled={busy}
              onChange={(q) => cart.setQuantity.mutate({ line, quantity: q })}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => cart.remove.mutate(line)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[13px] font-medium text-muted hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden /> Remove
          </button>
        </div>
      </div>
    </li>
  );
}
