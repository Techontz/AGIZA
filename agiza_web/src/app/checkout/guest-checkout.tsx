"use client";

/**
 * Checkout without an account (website only). The browser cart is priced by the server for
 * the city typed here (POST checkout/guest/preview/), with the same delivery options, totals
 * and price-change protection as a signed-in checkout. The placed order opens at
 * /order/<reference>?token=… — a signed link only this visitor gets.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";

import { Container } from "@/components/ui/container";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { CART_KEY, useGuestLines } from "@/hooks/use-cart";
import { ApiError, errorMessage } from "@/lib/api/client";
import { guestCheckoutApi, shopApi } from "@/lib/api/endpoints";
import type { CheckoutQuote, PaymentMethod } from "@/lib/api/types";
import { guestCart } from "@/lib/guest-cart";

import {
  CheckoutSkeleton,
  DeliveryOptions,
  EmptyCart,
  newIdempotencyKey,
  OrderSummary,
  PaymentSection,
  Section,
  selectedPayment,
} from "./checkout-parts";

type Contact = { full_name: string; phone: string; email: string; line1: string; area: string };

const FIELD_ERRORS = ["full_name", "phone", "email", "city", "line1", "area"];

export function GuestCheckout() {
  const router = useRouter();
  const client = useQueryClient();
  const { guestJson, guestLines } = useGuestLines();
  const cities = useQuery({ queryKey: ["cities"], queryFn: shopApi.cities, staleTime: 3_600_000 });
  const [contact, setContact] = useState<Contact>({ full_name: "", phone: "", email: "", line1: "", area: "" });
  const [city, setCity] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null); // null = the server picks the cheapest
  const [importMethodId, setImportMethodId] = useState<number | null>(null); // imported items: abroad → Tanzania
  const [chosenPayment, setPayment] = useState<PaymentMethod["code"] | null>(null);
  const [notes, setNotes] = useState("");
  const [changed, setChanged] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const previewKey = ["checkout-preview", "guest", guestJson, city, methodId, importMethodId];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: () => guestCheckoutApi.preview(guestLines, city!, methodId, importMethodId),
    enabled: city !== null && guestLines.length > 0,
    placeholderData: keepPreviousData,
  });
  const quote: CheckoutQuote | undefined = city !== null ? preview.data : undefined;
  const payment = selectedPayment(quote, chosenPayment);

  const place = useMutation({
    mutationFn: () =>
      guestCheckoutApi.placeOrder({
        items: guestLines,
        ...contact,
        city: city!,
        shipping_method: quote!.selected_shipping_method!,
        import_method: quote!.selected_import_method,
        payment_method: payment!,
        notes,
        idempotency_key: idempotencyKey.current,
        expected_total: quote!.total!,
      }),
    onSuccess: (result) => {
      guestCart.clear();
      client.invalidateQueries({ queryKey: CART_KEY });
      const orderUrl = `/order/${result.order.reference}?token=${encodeURIComponent(result.token)}`;
      if (result.payment?.checkout_url) {
        // Back from Selcom's payment page lands on the order, not on an empty checkout.
        window.history.replaceState(null, "", `${orderUrl}&payment=check`);
        window.location.assign(result.payment.checkout_url);
        return;
      }
      const failed = result.payment?.status === "failed" ? "&payment=failed" : "";
      router.replace(`${orderUrl}&placed=1${failed}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "price_changed" && e.details) {
        client.setQueryData(previewKey, e.details as CheckoutQuote);
        setChanged(true);
      }
    },
  });

  if (!guestLines.length && !place.isSuccess) return <EmptyCart />;
  if (city !== null && preview.isLoading) return <CheckoutSkeleton />;

  const set = (k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement>) => setContact({ ...contact, [k]: e.target.value });
  const err = place.error instanceof ApiError ? place.error : null;
  const detailsComplete = Boolean(contact.full_name.trim() && contact.phone.trim() && contact.line1.trim() && city);
  const refreshing = preview.isFetching;
  const canPlace = Boolean(quote?.can_place_order && payment && detailsComplete && !refreshing && !place.isPending);
  const shownOnForm = err && FIELD_ERRORS.some((f) => err.field(f));
  const placeError = place.error && !(err?.code === "price_changed") && !shownOnForm ? place.error : null;

  return (
    <Container className="py-6 sm:py-8">
      <h1 className="text-[24px] font-medium text-ink sm:text-[28px]">Checkout</h1>
      <p className="mt-1 text-[14px] text-muted">
        Checking out as a guest. Have an account?{" "}
        <Link href="/login?next=/checkout" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>{" "}
        to use your saved addresses.
      </p>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {quote?.issues.map((issue) => (
            <Notice key={issue} tone="warning">
              {issue}
            </Notice>
          ))}
          {preview.isError && !quote ? <Notice tone="danger">{errorMessage(preview.error)}</Notice> : null}

          <Section step={1} title="Your details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" htmlFor="g-name" error={err?.field("full_name")}>
                <Input id="g-name" autoComplete="name" maxLength={150} value={contact.full_name} onChange={set("full_name")} required />
              </Field>
              <Field label="Phone number" htmlFor="g-phone" hint="We call or text this number about your delivery." error={err?.field("phone")}>
                <Input id="g-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="0712 345 678" maxLength={32} value={contact.phone} onChange={set("phone")} required />
              </Field>
              <Field label="Email (optional)" htmlFor="g-email" error={err?.field("email")} className="sm:col-span-2">
                <Input id="g-email" type="email" autoComplete="email" value={contact.email} onChange={set("email")} />
              </Field>
            </div>
          </Section>

          <Section step={2} title="Delivery address">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City" htmlFor="g-city" error={err?.field("city")}>
                <Select
                  id="g-city"
                  required
                  value={city ?? ""}
                  onChange={(e) => {
                    setCity(Number(e.target.value));
                    setMethodId(null); // options depend on the city
                  }}
                >
                  <option value="" disabled>
                    {cities.isLoading ? "Loading cities…" : "Choose a city"}
                  </option>
                  {cities.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.region && c.region !== c.name ? ` (${c.region})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Area / neighbourhood" htmlFor="g-area" error={err?.field("area")}>
                <Input id="g-area" maxLength={120} value={contact.area} onChange={set("area")} />
              </Field>
              <Field label="Street, building or landmark" htmlFor="g-line1" error={err?.field("line1")} className="sm:col-span-2">
                <Input id="g-line1" autoComplete="street-address" maxLength={255} value={contact.line1} onChange={set("line1")} placeholder="Plot 12, Mikocheni B, near the mosque" required />
              </Field>
            </div>
          </Section>

          {quote ? (
            <>
              {quote.import_options.length ? <DeliveryOptions step={3} leg="import" quote={quote} onSelect={setImportMethodId} /> : null}
              <DeliveryOptions step={quote.import_options.length ? 4 : 3} quote={quote} onSelect={setMethodId} />
              <PaymentSection step={quote.import_options.length ? 5 : 4} quote={quote} payment={payment} onPayment={setPayment} notes={notes} onNotes={setNotes} />
            </>
          ) : (
            <Section step={3} title="Delivery and payment">
              <p className="text-[14px] text-muted">Choose your city to see delivery options, costs and payment methods.</p>
            </Section>
          )}
        </div>

        {quote ? (
          <OrderSummary
            quote={quote}
            refreshing={refreshing}
            changed={changed}
            placeError={placeError}
            payment={payment}
            canPlace={canPlace}
            placing={place.isPending}
            placeLabel={!detailsComplete ? "Fill in your details" : undefined}
            onPlace={() => {
              setChanged(false);
              place.mutate();
            }}
          />
        ) : (
          <aside className="rounded-lg bg-surface p-5 shadow-card">
            <h2 className="mb-2 text-lg font-semibold text-ink">Order summary</h2>
            <p className="text-[14px] text-muted">Your total, with delivery, shows here once you choose a city.</p>
            <Link href="/cart" className="mt-3 inline-block text-[13px] font-semibold text-primary hover:underline">
              Edit cart
            </Link>
          </aside>
        )}
      </div>
    </Container>
  );
}
