"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

/**
 * Products picked for side-by-side comparison (up to four), kept in this browser. The details
 * shown on /compare are always read from the catalogue API.
 */
const KEY = "agiza.compare.v1";
export const COMPARE_MAX = 4;
const listeners = new Set<() => void>();

function read(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)).slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

function write(ids: number[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, COMPARE_MAX)));
  } catch {
    // storage unavailable: the comparison lasts for this page only
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

export function useCompare() {
  const ids = JSON.parse(useSyncExternalStore(subscribe, getSnapshot, () => "[]")) as number[];
  const has = (id: number) => ids.includes(id);
  return {
    ids,
    count: ids.length,
    has,
    toggle(id: number) {
      if (has(id)) {
        write(ids.filter((i) => i !== id));
        return;
      }
      if (ids.length >= COMPARE_MAX) {
        toast.error(`You can compare up to ${COMPARE_MAX} products. Remove one first.`);
        return;
      }
      write([...ids, id]);
      toast.success("Added to compare", { action: { label: "Compare", onClick: () => window.location.assign("/compare") } });
    },
    remove(id: number) {
      write(ids.filter((i) => i !== id));
    },
    clear() {
      write([]);
    },
  };
}
