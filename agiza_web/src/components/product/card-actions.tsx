"use client";

import { useMutation } from "@tanstack/react-query";
import { ClipboardList, ShoppingCart, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCart } from "@/hooks/use-cart";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api/client";
import type { ProductCard, QuoteRequest } from "@/lib/api/types";
import { productHref } from "@/lib/format";

import { buttonClass, Button } from "../ui/button";

/**
 * On the product tile itself: In stock / Out of stock, then Add to cart + Buy now (in stock) or
 * Request (out of stock: AGIZA sources it). Products with options (size, colour…) open the product page.
 */
export function CardActions({ product }: { product: ProductCard }) {
  const router = useRouter();
  const pathname = usePathname();
  const cart = useCart();
  const session = useSession();
  const request = useMutation({
    mutationFn: () =>
      api.post<QuoteRequest>("requests/", {
        request_type: "buy_for_me",
        item_name: product.name.slice(0, 160),
        quantity: 1,
        product: product.id,
        details: "Out of stock on the AGIZA website. Please source it for me.",
      }),
    onSuccess: () => toast.success("Request sent — AGIZA will reply with a price", { action: { label: "My requests", onClick: () => router.push("/account/requests") } }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const add = async (thenCheckout: boolean) => {
    if (!product.variant) return;
    try {
      await cart.add.mutateAsync({ variant: product.variant, quantity: 1 });
      if (thenCheckout) router.push("/checkout");
      else toast.success("Added to your cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <p className={product.in_stock ? "text-[12px] font-semibold text-[#2e7d32]" : "text-[12px] font-semibold text-[#c62828]"}>
        {product.in_stock ? "● In stock" : "● Out of stock"}
      </p>
      {product.in_stock ? (
        product.variant ? (
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" className="px-2" loading={cart.add.isPending} onClick={() => add(false)} icon={<ShoppingCart className="size-3.5" aria-hidden />}>
              Add to cart
            </Button>
            <Button size="sm" variant="yellow" className="px-2" disabled={cart.add.isPending} onClick={() => add(true)} icon={<Zap className="size-3.5" aria-hidden />}>
              Buy now
            </Button>
          </div>
        ) : (
          <Link href={productHref(product)} className={buttonClass("primary", "sm", "w-full")}>
            Choose options
          </Link>
        )
      ) : product.can_request ? (
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          loading={request.isPending}
          disabled={request.isSuccess}
          onClick={() => (session.signedIn ? request.mutate() : router.push(`/login?next=${encodeURIComponent(pathname)}`))}
          icon={<ClipboardList className="size-3.5" aria-hidden />}
        >
          {request.isSuccess ? "Requested" : "Request"}
        </Button>
      ) : null}
    </div>
  );
}
