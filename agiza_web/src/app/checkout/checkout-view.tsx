"use client";

/**
 * Checkout. Everything shown is priced by the server (POST checkout/preview/) — the same
 * endpoint and rules the AGIZA app uses: items, the delivery options the Shipping Engine
 * offers for the address, one shipment per pickup point, the fee and the total. Placing the
 * order sends the total the customer saw; if anything changed the server refuses with a
 * fresh preview. One idempotency key per checkout means a retry never orders twice.
 *
 * Visitors who aren't signed in check out as guests (see guest-checkout.tsx).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ADDRESSES_KEY, AddressForm } from "@/components/account/address-form";
import { Container } from "@/components/ui/container";
import { Notice } from "@/components/ui/states";
import { CART_KEY } from "@/hooks/use-cart";
import { useSession } from "@/hooks/use-session";
import { ApiError, errorMessage } from "@/lib/api/client";
import { addressApi, checkoutApi } from "@/lib/api/endpoints";
import type { CheckoutQuote, PaymentMethod } from "@/lib/api/types";

import {
  CheckoutSkeleton,
  Choice,
  DeliveryOptions,
  EmptyCart,
  newIdempotencyKey,
  OrderSummary,
  PaymentSection,
  Section,
  selectedPayment,
} from "./checkout-parts";
import { GuestCheckout } from "./guest-checkout";

export function CheckoutView() {
  const { signedIn, ready } = useSession();
  if (!ready) return <CheckoutSkeleton />;
  return signedIn ? <AccountCheckout /> : <GuestCheckout />;
}

function AccountCheckout() {
  const router = useRouter();
  const client = useQueryClient();
  const addresses = useQuery({ queryKey: ADDRESSES_KEY, queryFn: addressApi.list });
  const [chosenAddress, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [methodId, setMethodId] = useState<number | null>(null); // null = the server picks the cheapest
  const [importMethodId, setImportMethodId] = useState<number | null>(null); // imported items: abroad → Tanzania
  const [chosenPayment, setPayment] = useState<PaymentMethod["code"] | null>(null);
  const [notes, setNotes] = useState("");
  const [changed, setChanged] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const defaultAddress = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0];
  const addressId = chosenAddress ?? defaultAddress?.id ?? null;
  const previewKey = ["checkout-preview", addressId, methodId, importMethodId];
  const preview = useQuery({
    queryKey: previewKey,
    queryFn: () => checkoutApi.preview(addressId!, methodId, importMethodId),
    enabled: addressId !== null,
    placeholderData: keepPreviousData,
  });
  const quote: CheckoutQuote | undefined = preview.data;
  const payment = selectedPayment(quote, chosenPayment);

  const place = useMutation({
    mutationFn: () =>
      checkoutApi.placeOrder({
        address: addressId!,
        shipping_method: quote!.selected_shipping_method!,
        import_method: quote!.selected_import_method,
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

  if (addresses.isLoading || (addressId !== null && preview.isLoading)) return <CheckoutSkeleton />;
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
  if (!quote.cart.items.length) return <EmptyCart />;

  const refreshing = preview.isFetching;
  const canPlace = quote.can_place_order && !!payment && !refreshing && !place.isPending;
  const placeError = place.error && !(place.error instanceof ApiError && place.error.code === "price_changed") ? place.error : null;

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

          {quote.import_options.length ? <DeliveryOptions step={2} leg="import" quote={quote} onSelect={setImportMethodId} /> : null}
          <DeliveryOptions step={quote.import_options.length ? 3 : 2} quote={quote} onSelect={setMethodId} />
          <PaymentSection step={quote.import_options.length ? 4 : 3} quote={quote} payment={payment} onPayment={setPayment} notes={notes} onNotes={setNotes} />
        </div>

        <OrderSummary
          quote={quote}
          refreshing={refreshing}
          changed={changed}
          placeError={placeError}
          payment={payment}
          canPlace={canPlace}
          placing={place.isPending}
          onPlace={() => {
            setChanged(false);
            place.mutate();
          }}
        />
      </div>
    </Container>
  );
}
