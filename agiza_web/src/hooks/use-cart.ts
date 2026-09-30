"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api/client";
import { cartApi } from "@/lib/api/endpoints";
import type { Cart, CartLine } from "@/lib/api/types";
import { guestCart, readGuestCart } from "@/lib/guest-cart";

import { useSession } from "./use-session";

const EMPTY_CART: Cart = { items: [], groups: [], item_count: 0, subtotal: "0.00", currency: "TZS", has_issues: false };

export const CART_KEY = ["cart"] as const;

let snapshot = "[]";
function subscribe(fn: () => void) {
  return guestCart.subscribe(fn);
}
function getSnapshot() {
  const next = JSON.stringify(readGuestCart());
  if (next !== snapshot) snapshot = next;
  return snapshot;
}

/**
 * One cart API for the whole site. Signed in: the account's cart on the server. Visitor: the
 * browser cart, priced by the server. Either way the numbers shown come from the backend.
 */
export function useCart() {
  const client = useQueryClient();
  const { signedIn, ready } = useSession();
  const guestJson = useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  const guestLines = JSON.parse(guestJson) as { variant: number; quantity: number }[];
  const merging = useRef(false);

  // Signing in: the browser cart joins the account's cart once, then is cleared.
  useEffect(() => {
    if (!ready || !signedIn || merging.current) return;
    const lines = readGuestCart();
    if (!lines.length) return;
    merging.current = true;
    cartApi
      .merge(lines)
      .then((cart) => {
        guestCart.clear();
        client.setQueryData([...CART_KEY, "account"], cart);
        cart.notes?.forEach((n) => toast.message(n));
      })
      .catch(() => undefined)
      .finally(() => {
        merging.current = false;
      });
  }, [ready, signedIn, client]);

  const query = useQuery<Cart>({
    queryKey: signedIn ? [...CART_KEY, "account"] : [...CART_KEY, "guest", guestJson],
    // An empty guest cart needs no pricing: skip the request (keeps visitors well under the API's per-IP limit).
    queryFn: () => (signedIn ? cartApi.get() : guestLines.length ? cartApi.guest(guestLines) : Promise.resolve(EMPTY_CART)),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const setCart = (cart: Cart) => {
    if (signedIn) client.setQueryData([...CART_KEY, "account"], cart);
  };

  const add = useMutation({
    mutationFn: async ({ variant, quantity }: { variant: number; quantity: number }) => {
      if (signedIn) return cartApi.add(variant, quantity);
      guestCart.add(variant, quantity);
      return null;
    },
    onSuccess: (cart) => cart && setCart(cart),
  });

  const setQuantity = useMutation({
    mutationFn: async ({ line, quantity }: { line: CartLine; quantity: number }) => {
      if (signedIn && line.id) return cartApi.setQuantity(line.id, quantity);
      guestCart.set(line.variant_id, quantity);
      return null;
    },
    onSuccess: (cart) => cart && setCart(cart),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (line: CartLine) => {
      if (signedIn && line.id) return cartApi.remove(line.id);
      guestCart.remove(line.variant_id);
      return null;
    },
    onSuccess: (cart) => cart && setCart(cart),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const count = query.data?.item_count ?? (signedIn ? 0 : guestLines.reduce((n, l) => n + l.quantity, 0));
  return { ...query, add, setQuantity, remove, count, signedIn };
}
