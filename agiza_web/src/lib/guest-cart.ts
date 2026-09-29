/**
 * A visitor's cart before signing in: only variant ids and quantities, kept in this browser.
 * It is always priced by the server (POST cart/guest/) and joins the account's cart at sign-in.
 */
import type { GuestLine } from "@/lib/api/endpoints";

const KEY = "agiza.cart.v1";
const MAX_LINES = 50;
const MAX_QTY = 100;

type Listener = () => void;
const listeners = new Set<Listener>();

export function readGuestCart(): GuestLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw
          .filter((l) => Number.isInteger(l?.variant) && Number.isInteger(l?.quantity) && l.quantity > 0)
          .slice(0, MAX_LINES)
      : [];
  } catch {
    return [];
  }
}

function write(lines: GuestLine[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines.slice(0, MAX_LINES)));
  } catch {
    // storage unavailable (private mode): the cart just won't survive a reload
  }
  listeners.forEach((fn) => fn());
}

export const guestCart = {
  add(variant: number, quantity: number) {
    const lines = readGuestCart();
    const line = lines.find((l) => l.variant === variant);
    if (line) line.quantity = Math.min(line.quantity + quantity, MAX_QTY);
    else lines.push({ variant, quantity: Math.min(quantity, MAX_QTY) });
    write(lines);
  },
  set(variant: number, quantity: number) {
    write(readGuestCart().map((l) => (l.variant === variant ? { ...l, quantity: Math.min(quantity, MAX_QTY) } : l)));
  },
  remove(variant: number) {
    write(readGuestCart().filter((l) => l.variant !== variant));
  },
  clear() {
    write([]);
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => e.key === KEY && fn();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(fn);
      window.removeEventListener("storage", onStorage);
    };
  },
};
