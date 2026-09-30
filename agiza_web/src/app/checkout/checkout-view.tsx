"use client";

/**
 * Checkout. Everything shown is priced by the server (POST checkout/preview/) — the same
 * endpoint and rules the AGIZA app uses: items, the delivery options the Shipping Engine
 * offers for the address, one shipment per pickup point, the fee and the total. Placing the
 * order sends the total the customer saw; if anything changed the server refuses with a
 * fresh preview. One idempotency key per checkout means a retry never orders twice.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Lock, MapPin, Package, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ADDRESSES_KEY, AddressForm } from "@/components/account/address-form";
import { ProductImage } from "@/components/product/product-image";
import { StoreAvatar } from "@/components/store/store-avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState, Notice, Row, Skeleton } from "@/components/ui/states";
import { CART_KEY } from "@/hooks/use-cart";
import { ApiError, errorMessage } from "@/lib/api/client";
import { addressApi, checkoutApi } from "@/lib/api/endpoints";
import type { CheckoutQuote, PaymentMethod, ShippingOption } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { isFree, money } from "@/lib/format";

function Choice({
  selected,
  onSelect,
  title,
  subtitle,
  trailing,
  disabled,
  name,
}: {
  selected: boolean;
  onSelect?: () => void;
  title: string;
  subtitle?: React.ReactNode;
  trailing?: string;
  disabled?: boolean;
  name: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md border bg-surface p-3.5 transition-colors",
        selected ? "border-primary bg-primary-soft" : "border-line hover:border-line-strong",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input type="radio" name={name} className="sr-only" checked={selected} disabled={disabled} onChange={() => onSelect?.()} />
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-primary" : "border-line-strong")} aria-hidden>
        {selected ? <span className="size-2.5 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">{title}</span>
        {subtitle ? <span className={cn("block text-[13px]", disabled ? "text-danger" : "text-muted")}>{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-[15px] font-semibold text-ink tabular-nums">{trailing}</span> : null}
    </label>
  );
}

const optionSubtitle = (o: ShippingOption) =>
  !o.available ? o.message : [o.estimated_delivery, o.carrier].filter(Boolean).join(" · ") || o.description;

function Shipments({ option }: { option: ShippingOption }) {
  if ((option.shipments?.length ?? 0) < 2) return null;
  return (
    <div className="rounded-md border border-line bg-canvas p-3.5">
      <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
        <Package className="size-4 text-brand" aria-hidden /> Delivered in {option.shipments.length} shipments
      </p>
      <p className="mt-0.5 mb-2 text-[13px] text-muted">Your items are collected from different places, so each pickup has its own delivery fee.</p>
      <ul className="space-y-1">
        {option.shipments.map((s, i) => (
          <li key={`${s.label}-${i}`} className="flex justify-between gap-3 text-[13px]">
            <span className="text-muted">{s.label}</span>
            <span className="font-medium text-ink tabular-nums">{isFree(s.cost) ? "Free" : money(s.cost, option.currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ step, title, action, children }: { step: number; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
          <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">{step}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CheckoutView() {
  const router = useRouter();
  const client = useQueryClient();
  const addresses = useQuery({ queryKey: ADDRESSES_KEY, queryFn: addressApi.list });
  const [chosenAddress, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [methodId, setMethodId] = useState<number | null>(null); // null = the server picks the cheapest
  const [chosenPayment, setPayment] = useState<PaymentMethod["code"] | null>(null);
  const [notes, setNotes] = useState("");
  const [changed, setChanged] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const idempotencyKey = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const defaultAddress = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];
  const addressId = chosenAddress ?? defaultAddress?.id ?? null;
  const previewKey = ["checkout-preview", addressId, methodId];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: () => checkoutApi.preview(addressId!, methodId),
    enabled: addressId !== null,
    placeholderData: keepPreviousData,
  });
  const quote: CheckoutQuote | undefined = preview.data;
  const payment = quote?.payment_methods.some((m) => m.code === chosenPayment) ? chosenPayment : (quote?.payment_methods[0]?.code ?? null);

  const place = useMutation({
    mutationFn: () =>
      checkoutApi.placeOrder({
        address: addressId!,
        shipping_method: quote!.selected_shipping_method!,
        payment_method: payment!,
        notes,
        idempotency_key: idempotencyKey.current,
        expected_total: quote!.total!,
      }),
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: CART_KEY });
      client.invalidateQueries({ queryKey: ["orders"] });
      const reference = result.order.reference;
      if (result.payment?.checkout_url) {
        window.location.assign(result.payment.checkout_url); // Selcom's hosted payment page
        return;
      }
      const failed = result.payment?.status === "failed" ? "&payment=failed" : "";
      router.replace(`/account/orders/${reference}?placed=1${failed}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "price_changed" && e.details) {
        client.setQueryData(previewKey, e.details as CheckoutQuote);
        setChanged(true);
      }
    },
  });

  if (addresses.isLoading || (addressId !== null && preview.isLoading)) {
    return (
      <Container className="py-8">
        <Skeleton className="mb-6 h-8 w-40" />
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="h-72" />
        </div>
      </Container>
    );
  }
  if (addresses.isError) {
    return (
      <Container className="py-10">
        <Notice tone="danger">{errorMessage(addresses.error)}</Notice>
      </Container>
    );
  }
  if (!addresses.data?.length) {
    return (
      <Container className="max-w-2xl py-10">
        <h1 className="mb-2 text-[24px] font-medium text-ink">Where should we deliver?</h1>
        <p className="mb-6 text-muted">Add a delivery address to see delivery options and costs for your order.</p>
        <div className="rounded-lg bg-surface p-5 shadow-card">
          <AddressForm onDone={(a) => setAddressId(a.id)} />
        </div>
      </Container>
    );
  }
  if (preview.isError && !quote) {
    return (
      <Container className="py-10">
        <Notice tone="danger">{errorMessage(preview.error)}</Notice>
      </Container>
    );
  }
  if (!quote) return null;
  if (!quote.cart.items.length) {
    return (
      <Container className="py-10">
        <EmptyState icon={ShoppingBag} title="Your cart is empty" action={<ButtonLink href="/shop">Go shopping</ButtonLink>} />
      </Container>
    );
  }

  const available = quote.shipping_options.filter((o) => o.available);
  const unavailable = quote.shipping_options.filter((o) => !o.available);
  const selectedOption = available.find((o) => o.method_id === quote.selected_shipping_method);
  const refreshing = preview.isFetching;
  const canPlace = quote.can_place_order && !!payment && !refreshing && !place.isPending;
  const placeError = place.error && !(place.error instanceof ApiError && place.error.code === "price_changed") ? place.error : null;
  const groups = quote.cart.groups;
  const byVariant = new Map(quote.cart.items.map((l) => [l.variant_id, l]));

  return (
    <Container className="py-6 sm:py-8">
      <h1 className="text-[24px] font-medium text-ink sm:text-[28px]">Checkout</h1>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {quote.issues.map((issue) => (
            <Notice key={issue} tone="warning">
              {issue}
            </Notice>
          ))}

          <Section
            step={1}
            title="Delivery address"
            action={
              !adding ? (
                <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-[14px] font-semibold text-primary hover:underline">
                  <Plus className="size-4" aria-hidden /> New address
                </button>
              ) : null
            }
          >
            {adding ? (
              <AddressForm
                onCancel={() => setAdding(false)}
                onDone={(a) => {
                  setAdding(false);
                  setAddressId(a.id);
                  setMethodId(null);
                }}
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Delivery address">
                {addresses.data.map((a) => (
                  <Choice
                    key={a.id}
                    name="address"
                    selected={a.id === addressId}
                    onSelect={() => {
                      setAddressId(a.id);
                      setMethodId(null); // options depend on the address
                    }}
                    title={a.label || a.city_name}
                    subtitle={a.one_line}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section step={2} title="Delivery option">
            {available.length ? (
              <div className="space-y-2" role="radiogroup" aria-label="Delivery option">
                {available.map((o) => (
                  <Choice
                    key={o.method_id}
                    name="shipping"
                    selected={o.method_id === quote.selected_shipping_method}
                    onSelect={() => setMethodId(o.method_id)}
                    title={o.name}
                    subtitle={optionSubtitle(o)}
                    trailing={isFree(o.cost) ? "Free" : money(o.cost, o.currency)}
                  />
                ))}
                {selectedOption ? <Shipments option={selectedOption} /> : null}
              </div>
            ) : null}
            {unavailable.length ? (
              <div className="mt-3">
                <button type="button" onClick={() => setShowUnavailable((v) => !v)} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
                  <CircleAlert className="size-4" aria-hidden />
                  {showUnavailable ? "Hide" : "Show"} {unavailable.length} option{unavailable.length === 1 ? "" : "s"} not available here
                </button>
                {showUnavailable ? (
                  <div className="mt-2 space-y-2">
                    {unavailable.map((o) => (
                      <Choice key={o.method_id} name="unavailable" selected={false} disabled title={o.name} subtitle={optionSubtitle(o)} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section step={3} title="Payment">
            <div className="space-y-2" role="radiogroup" aria-label="Payment method">
              {quote.payment_methods.map((m) => (
                <Choice key={m.code} name="payment" selected={payment === m.code} onSelect={() => setPayment(m.code)} title={m.label} subtitle={m.description} />
              ))}
            </div>
            <Field label="Delivery notes (optional)" htmlFor="notes" className="mt-4">
              <Textarea id="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate colour, landmark, best time to call…" />
            </Field>
          </Section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-24">
          <div className="rounded-lg bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-lg font-semibold text-ink">Order summary</h2>
            <div className="max-h-[340px] space-y-4 overflow-y-auto pr-1">
              {groups.map((g) => (
                <div key={g.vendor.slug}>
                  <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <StoreAvatar seller={g.vendor} size={22} /> {g.vendor.name}
                  </p>
                  <ul className="space-y-2.5">
                    {g.variant_ids.map((vid) => {
                      const line = byVariant.get(vid);
                      if (!line) return null;
                      return (
                        <li key={vid} className="flex gap-3">
                          <span className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-tile">
                            <ProductImage src={line.image} alt="" sizes="48px" iconClass="size-5" />
                            <span className="absolute -top-0 -right-0 rounded-bl-sm bg-ink px-1 text-[11px] font-bold text-white">{line.quantity}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 text-[14px] text-ink">{line.name}</span>
                            {line.issue ? <span className="text-[12px] text-danger">{line.issue}</span> : <span className="text-[12px] text-muted">{line.variant_name || `${money(line.unit_price)} each`}</span>}
                          </span>
                          <span className="text-[14px] font-medium text-ink tabular-nums">{money(line.line_total)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <Link href="/cart" className="mt-3 inline-block text-[13px] font-semibold text-primary hover:underline">
              Edit cart
            </Link>
            <div className="my-3 border-t border-line" />
            <Row label="Subtotal" value={money(quote.subtotal, quote.currency)} />
            <Row
              label={selectedOption && selectedOption.shipments.length > 1 ? `Delivery (${selectedOption.shipments.length} shipments)` : "Delivery"}
              value={quote.shipping_fee === null ? "—" : isFree(quote.shipping_fee) ? "Free" : money(quote.shipping_fee, quote.currency)}
            />
            <div className="my-2 border-t border-line" />
            <div className="flex items-center justify-between py-1">
              <span className="font-semibold text-ink">Total</span>
              <span className={cn("text-[22px] font-bold text-ink tabular-nums", refreshing && "opacity-50")}>{money(quote.total, quote.currency)}</span>
            </div>
            {changed ? (
              <Notice tone="warning" className="mt-3">
                Prices or delivery changed. Review the new total, then place your order.
              </Notice>
            ) : null}
            {placeError ? (
              <Notice tone="danger" className="mt-3">
                {errorMessage(placeError)}
              </Notice>
            ) : null}
            <Button
              size="lg"
              className="mt-4 w-full"
              loading={place.isPending}
              disabled={!canPlace}
              onClick={() => {
                setChanged(false);
                place.mutate();
              }}
            >
              {payment === "mobile_money" ? "Place order & pay" : "Place order"}
            </Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-muted">
              <Lock className="size-3.5" aria-hidden /> Totals are calculated and checked by AGIZA.
            </p>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted">
            <MapPin className="size-4" aria-hidden /> One order, one payment — even from several stores.
          </p>
        </aside>
      </div>
    </Container>
  );
}
