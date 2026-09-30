"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api/client";
import { wishlistApi } from "@/lib/api/endpoints";

import { useSession } from "./use-session";

/**
 * Saved products. Signed in: the account's list on the server. Visitor: ids kept in this browser,
 * added to the account's list at sign-in.
 */
const KEY = "agiza.saved.v1";
export const WISHLIST_KEY = ["wishlist"] as const;
const listeners = new Set<() => void>();

function read(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)).slice(0, 200) : [];
  } catch {
    return [];
  }
}

function write(ids: number[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 200)));
  } catch {
    // storage unavailable: saved products last for this visit only
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

let snapshot = "[]";
const getSnapshot = () => {
  const next = JSON.stringify(read());
  if (next !== snapshot) snapshot = next;
  return snapshot;
};

export function useWishlist() {
  const client = useQueryClient();
  const { signedIn, ready } = useSession();
  const localJson = useSyncExternalStore(subscribe, getSnapshot, () => "[]");
  const merging = useRef(false);
  const server = useQuery({ queryKey: WISHLIST_KEY, queryFn: wishlistApi.get, enabled: ready && signedIn, staleTime: 60_000 });

  useEffect(() => {
    if (!ready || !signedIn || merging.current) return;
    const ids = read();
    if (!ids.length) return;
    merging.current = true;
    wishlistApi
      .merge(ids)
      .then((body) => {
        write([]);
        client.setQueryData(WISHLIST_KEY, body);
      })
      .catch(() => undefined)
      .finally(() => {
        merging.current = false;
      });
  }, [ready, signedIn, client]);

  const ids: number[] = signedIn ? (server.data?.product_ids ?? []) : (JSON.parse(localJson) as number[]);

  const toggle = useMutation({
    mutationFn: async (productId: number) => {
      const saved = ids.includes(productId);
      if (!signedIn) {
        write(saved ? ids.filter((i) => i !== productId) : [productId, ...ids]);
        return { saved: !saved, body: null };
      }
      const body = saved ? await wishlistApi.remove(productId) : await wishlistApi.add(productId);
      return { saved: !saved, body };
    },
    onSuccess: ({ saved, body }) => {
      if (body) client.setQueryData(WISHLIST_KEY, body);
      toast.success(saved ? "Saved" : "Removed from saved products");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return { ids, has: (id: number) => ids.includes(id), toggle, server, signedIn, count: ids.length };
}
