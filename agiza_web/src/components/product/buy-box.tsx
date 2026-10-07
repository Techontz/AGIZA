"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Plane, ShoppingBag, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useCart } from "@/hooks/use-cart";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api/client";
import type { ProductDetail, QuoteRequest } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

import { Button } from "../ui/button";
import { QuantityStepper } from "../ui/stepper";
import { DeliveryCalculator } from "./delivery-calculator";

/** Options, quantity, Add to cart and Buy now. Availability and prices come from the API. */
export function BuyBox({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const cart = useCart();
  const session = useSession();
  const client = useQueryClient();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [requestQty, setRequestQty] = useState(1);

  const variant = useMemo(
    () => product.variants.find((v) => v.id === variantId) ?? product.variants.find((v) => v.is_default) ?? product.variants[0],
    [product.variants, variantId],
  );
  const available = variant?.available ?? 0;
  const inCart = cart.data?.items.find((i) => i.variant_id === variant?.id)?.quantity ?? 0;
  const maxAdd = Math.max(0, Math.min(available - inCart, 100 - inCart));
  const compare = variant?.compare_at_price && Number(variant.compare_at_price) > Number(variant.price) ? variant.compare_at_price : null;
  // Sold out (imported products are bought abroad, never sold out); staff may allow requests for it ("Pata Bei").
  const canRequest = !product.ships_from && available === 0 && product.can_request === true;

  // Asks AGIZA to source it: a "Buy for me" request in Intake & Quotes naming the shop product.
  const request = useMutation({
    mutationFn: () => {
      const options = variant?.options.length ? variant.options.map((o) => o.value).join(" / ") : "";
      return api.post<QuoteRequest>("requests/", {
        request_type: "buy_for_me",
        item_name: [product.name, options].filter(Boolean).join(" — ").slice(0, 160),
        quantity: requestQty,
        product: product.id,
        details: `Out of stock on the AGIZA website. Please source ${requestQty} for me.`,
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["requests"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const askForIt = () => {
    if (!session.signedIn) return router.push(`/login?next=${encodeURIComponent(pathname)}`);
    request.mutate();
  };

  const add = async (thenCheckout: boolean) => {
    if (!variant) return;
    setAdded(false);
    try {
      await cart.add.mutateAsync({ variant: variant.id, quantity });
      setQuantity(1);
      if (thenCheckout) {
        router.push("/checkout"); // guests check out without an account
      } else {
        setAdded(true);
        toast.success("Added to your cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={cn("text-[24px] leading-tight tabular-nums", compare ? "text-sale" : "text-ink")}>{money(variant?.price ?? product.price)}</span>
        {compare ? <span className="text-[18px] font-semibold text-muted line-through tabular-nums">{money(compare)}</span> : null}
      </div>

      {product.variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-[15px] font-semibold text-ink">Options</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {product.variants.map((v) => {
              const active = v.id === variant?.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setVariantId(v.id);
                    setQuantity(1);
                    setAdded(false);
                  }}
                  className={cn(
                    "rounded-sm border px-3.5 py-2 text-[14px] transition-colors",
                    active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-text hover:border-ink",
                    v.available === 0 && "opacity-50",
                  )}
                >
                  {v.options.length ? v.options.map((o) => o.value).join(" / ") : v.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {product.ships_from ? (
        <p className="flex items-start gap-2 text-[14px] text-ink">
          <Plane className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            <span className="font-semibold">Ships from {product.ships_from}.</span> AGIZA orders it for you once you pay; see delivery cost and time below.
          </span>
        </p>
      ) : (
        <p className={cn("text-[14px]", available > 0 ? "text-success" : "text-danger")}>
          ({available > 0 ? (available <= 3 ? `Only ${available} left` : "Available") : "Out of stock"})
        </p>
      )}
      {canRequest ? (
        request.data ? (
          <div className="rounded-sm border border-success/40 bg-success-soft p-4 text-[14px] text-ink" role="status">
            <p className="flex items-center gap-1.5 font-semibold text-success">
              <Check className="size-4" aria-hidden /> Request {request.data.reference} sent
            </p>
            <p className="mt-1">AGIZA will source it and send you a price. You&apos;ll find it in your requests.</p>
            <Link href="/account/requests" className="mt-2 inline-block font-medium text-primary hover:underline">
              View my requests
            </Link>
          </div>
        ) : (
          <div>
            <p className="mb-1.5 text-[14px] text-ink">Request it and AGIZA will source it and send you a price.</p>
            <div className="flex flex-wrap items-center gap-2.5 max-sm:flex-col max-sm:items-stretch max-sm:[&>div]:w-full max-sm:[&>div]:justify-between">
              <QuantityStepper value={requestQty} max={100} onChange={setRequestQty} />
              <Button
                size="lg"
                className="min-w-40 max-sm:w-full"
                icon={<ClipboardList className="size-5" />}
                onClick={askForIt}
                loading={request.isPending}
                disabled={!session.ready}
              >
                Request this product
              </Button>
            </div>
            {session.ready && !session.signedIn ? (
              <p className="mt-1.5 text-[13px] text-muted">Sign in to send a request; you&apos;ll come back to this page.</p>
            ) : null}
          </div>
        )
      ) : (
        <div>
          {maxAdd > 0 ? <p className="mb-1.5 text-[14px] text-ink">Quantity</p> : null}
          <div className="flex flex-wrap items-center gap-2.5 max-sm:flex-col max-sm:items-stretch max-sm:[&>div]:w-full max-sm:[&>div]:justify-between">
            {maxAdd > 0 ? <QuantityStepper value={quantity} max={maxAdd} onChange={setQuantity} /> : null}
            <Button
              size="lg"
              className="min-w-40 max-sm:w-full"
              icon={<ShoppingBag className="size-5" />}
              onClick={() => add(false)}
              loading={cart.add.isPending}
              disabled={maxAdd === 0 || (!cart.isFetched && cart.signedIn)}
            >
              {available === 0 ? "Out of stock" : maxAdd === 0 ? "All stock in your cart" : "Add to cart"}
            </Button>
            {maxAdd > 0 ? (
              <Button
                size="lg"
                variant="yellow"
                className="max-sm:w-full"
                icon={<Zap className="size-5" />}
                onClick={() => add(true)}
                disabled={cart.add.isPending}
              >
                Buy now
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {variant ? <DeliveryCalculator variantId={variant.id} quantity={quantity} /> : null}
      {added ? (
        <p className="flex items-center gap-1.5 text-[14px] font-medium text-success">
          <Check className="size-4" aria-hidden /> Added to your cart ·{" "}
          <Link href="/cart" className="text-primary hover:underline">
            View cart
          </Link>
        </p>
      ) : null}
    </div>
  );
}
