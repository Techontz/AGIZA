"use client";

import { Check, ShoppingBag, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useCart } from "@/hooks/use-cart";
import { errorMessage } from "@/lib/api/client";
import type { ProductDetail } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

import { Button } from "../ui/button";
import { QuantityStepper } from "../ui/stepper";

/** Options, quantity, Add to cart and Buy now. Availability and prices come from the API. */
export function BuyBox({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const cart = useCart();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const variant = useMemo(
    () => product.variants.find((v) => v.id === variantId) ?? product.variants.find((v) => v.is_default) ?? product.variants[0],
    [product.variants, variantId],
  );
  const available = variant?.available ?? 0;
  const inCart = cart.data?.items.find((i) => i.variant_id === variant?.id)?.quantity ?? 0;
  const maxAdd = Math.max(0, Math.min(available - inCart, 100 - inCart));
  const compare = variant?.compare_at_price && Number(variant.compare_at_price) > Number(variant.price) ? variant.compare_at_price : null;

  const add = async (thenCheckout: boolean) => {
    if (!variant) return;
    setAdded(false);
    try {
      await cart.add.mutateAsync({ variant: variant.id, quantity });
      setQuantity(1);
      if (thenCheckout) {
        router.push(cart.signedIn ? "/checkout" : "/login?next=/checkout");
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

      <p className={cn("text-[14px]", available > 0 ? "text-success" : "text-danger")}>
        ({available > 0 ? (available <= 3 ? `Only ${available} left` : "Available") : "Out of stock"})
      </p>
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
