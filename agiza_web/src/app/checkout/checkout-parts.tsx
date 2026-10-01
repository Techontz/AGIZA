"use client";

/**
 * The pieces both checkouts share (signed in and guest): delivery options, payment, and the
 * order summary with the place-order button. Everything shown comes from the server's quote.
 */
import { CircleAlert, Lock, MapPin, Package, Plane, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ProductImage } from "@/components/product/product-image";
import { StoreAvatar } from "@/components/store/store-avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import type { CheckoutQuote, PaymentMethod, ShippingOption } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { isFree, money } from "@/lib/format";

export function Choice({
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

export function Section({ step, title, action, children }: { step: number; title: string; action?: React.ReactNode; children: React.ReactNode }) {
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

export function DeliveryOptions({
  step,
  quote,
  onSelect,
  leg = "delivery",
}: {
  step: number;
  quote: CheckoutQuote;
  onSelect: (methodId: number) => void;
  /** "import": shipping imported items to Tanzania; "delivery": to the customer's address. */
  leg?: "import" | "delivery";
}) {
  const [showUnavailable, setShowUnavailable] = useState(false);
  const options = leg === "import" ? quote.import_options : quote.shipping_options;
  const selectedId = leg === "import" ? quote.selected_import_method : quote.selected_shipping_method;
  const title = leg === "import" ? "Shipping to Tanzania" : quote.import_options.length ? "Delivery in Tanzania" : "Delivery option";
  const available = options.filter((o) => o.available);
  const unavailable = options.filter((o) => !o.available);
  const selectedOption = available.find((o) => o.method_id === selectedId);
  const origins = [...new Set(quote.cart.items.filter((l) => l.imported && l.origin).map((l) => l.origin))];
  return (
    <Section step={step} title={title}>
      {leg === "import" ? (
        <p className="mb-3 flex items-start gap-2 text-[13px] text-muted">
          <Plane className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          {origins.length ? `Imported from ${origins.join(", ")}` : "Imported items"} — AGIZA buys them after you pay and ships them to Tanzania. Choose how.
        </p>
      ) : null}
      {available.length ? (
        <div className="space-y-2" role="radiogroup" aria-label={title}>
          {available.map((o) => (
            <Choice
              key={o.method_id}
              name={leg === "import" ? "import-shipping" : "shipping"}
              selected={o.method_id === selectedId}
              onSelect={() => onSelect(o.method_id)}
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
  );
}

export function PaymentSection({
  step,
  quote,
  payment,
  onPayment,
  notes,
  onNotes,
}: {
  step: number;
  quote: CheckoutQuote;
  payment: PaymentMethod["code"] | null;
  onPayment: (code: PaymentMethod["code"]) => void;
  notes: string;
  onNotes: (notes: string) => void;
}) {
  return (
    <Section step={step} title="Payment">
      {quote.prepayment_required ? (
        <Notice tone="info" className="mb-3">
          Your order has imported items, so it is paid when you order. AGIZA buys them abroad once your payment is confirmed.
          {quote.payment_window_hours ? ` Unpaid orders are cancelled after ${quote.payment_window_hours} hours.` : ""}
        </Notice>
      ) : null}
      <div className="space-y-2" role="radiogroup" aria-label="Payment method">
        {quote.payment_methods.map((m) => (
          <Choice key={m.code} name="payment" selected={payment === m.code} onSelect={() => onPayment(m.code)} title={m.label} subtitle={m.description} />
        ))}
      </div>
      <Field label="Delivery notes (optional)" htmlFor="notes" className="mt-4">
        <Textarea id="notes" maxLength={500} value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="Gate colour, landmark, best time to call…" />
      </Field>
    </Section>
  );
}

/** The payment method to show selected: the visitor's choice while the server still offers it, else the first. */
export function selectedPayment(quote: CheckoutQuote | undefined, chosen: PaymentMethod["code"] | null) {
  return quote?.payment_methods.some((m) => m.code === chosen) ? chosen : (quote?.payment_methods[0]?.code ?? null);
}

export function OrderSummary({
  quote,
  refreshing,
  changed,
  placeError,
  payment,
  canPlace,
  placing,
  onPlace,
  placeLabel,
}: {
  quote: CheckoutQuote;
  refreshing: boolean;
  changed: boolean;
  placeError: unknown;
  payment: PaymentMethod["code"] | null;
  canPlace: boolean;
  placing: boolean;
  onPlace: () => void;
  placeLabel?: string;
}) {
  const selectedOption = quote.shipping_options.find((o) => o.available && o.method_id === quote.selected_shipping_method);
  const byVariant = new Map(quote.cart.items.map((l) => [l.variant_id, l]));
  return (
    <aside className="space-y-3 lg:sticky lg:top-24">
      <div className="rounded-lg bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-lg font-semibold text-ink">Order summary</h2>
        <div className="max-h-[340px] space-y-4 overflow-y-auto pr-1">
          {quote.cart.groups.map((g) => (
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
                        {line.issue ? <span className="text-[12px] text-danger">{line.issue}</span> : <span className="block text-[12px] text-muted">{line.variant_name || `${money(line.unit_price)} each`}</span>}
                        {line.imported && !line.issue ? <span className="block text-[12px] font-medium text-brand">Ships from {line.origin ?? "abroad"}</span> : null}
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
        <CostLines quote={quote} selectedOption={selectedOption} />
        <div className="my-2 border-t border-line" />
        <div className="flex items-center justify-between py-1">
          <span className="font-semibold text-ink">Total</span>
          <span className={cn("text-[22px] font-bold text-ink tabular-nums", refreshing && "opacity-50")}>{money(quote.total, quote.currency)}</span>
        </div>
        {quote.customs?.note ? <p className="mt-2 text-[12px] leading-snug text-muted">{quote.customs.note}</p> : null}
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
        <Button size="lg" className="mt-4 w-full" loading={placing} disabled={!canPlace} onClick={onPlace}>
          {placeLabel ?? (payment === "mobile_money" ? "Place order & pay" : "Place order")}
        </Button>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-muted">
          <Lock className="size-3.5" aria-hidden /> Totals are calculated and checked by AGIZA.
        </p>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-muted">
        <MapPin className="size-4" aria-hidden /> One order, one payment — even from several stores.
      </p>
    </aside>
  );
}

/**
 * The money lines, all from the server's quote: products, international shipping, customs
 * (charged lines; estimates are marked and not added), local delivery. The total comes from the server too.
 */
function CostLines({ quote, selectedOption }: { quote: CheckoutQuote; selectedOption?: ShippingOption }) {
  const imported = quote.import_options.length > 0;
  const shipments = selectedOption?.shipments.length ?? 0;
  const customs = quote.customs;
  return (
    <>
      <Row label={imported ? "Products" : "Subtotal"} value={money(quote.subtotal, quote.currency)} />
      {imported ? (
        <Row label="International shipping" value={quote.selected_import_method === null ? "—" : money(quote.import_fee, quote.currency)} />
      ) : null}
      {customs
        ? customs.lines.map((line) => (
            <Row
              key={`${line.kind}-${line.name}-${line.treatment}`}
              label={line.treatment === "estimate" ? `${line.name} (estimate, paid separately)` : line.name}
              value={line.treatment === "estimate" ? `≈ ${money(line.amount, quote.currency)}` : money(line.amount, quote.currency)}
            />
          ))
        : null}
      {customs && customs.status === "not_included" ? <Row label="Customs / import duty" value="Not included" /> : null}
      <Row
        label={`${imported ? "Local delivery" : "Delivery"}${shipments > 1 ? ` (${shipments} shipments)` : ""}`}
        value={quote.delivery_fee === null ? "—" : isFree(quote.delivery_fee) ? "Free" : money(quote.delivery_fee, quote.currency)}
      />
      {quote.estimated_delivery ? <Row label="Estimated delivery" value={quote.estimated_delivery} /> : null}
    </>
  );
}

/** One idempotency key per checkout visit: a retried request never orders twice. */
export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutSkeleton() {
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

export function EmptyCart() {
  return (
    <Container className="py-10">
      <EmptyState icon={ShoppingBag} title="Your cart is empty" action={<ButtonLink href="/shop">Go shopping</ButtonLink>} />
    </Container>
  );
}
