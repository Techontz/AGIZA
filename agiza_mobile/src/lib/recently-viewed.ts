import * as SecureStore from 'expo-secure-store';

import { queryClient } from '@/lib/query';

/** The products this customer opened lately, newest first. Kept on the phone (the server doesn't track views). */
const KEY = 'agiza.recently-viewed';
const MAX = 20;
export const recentlyViewedKey = ['recently-viewed'] as const;

export async function recentlyViewed(): Promise<number[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((i): i is number => typeof i === 'number').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export async function rememberViewed(productId: number) {
  const ids = [productId, ...(await recentlyViewed()).filter((i) => i !== productId)].slice(0, MAX);
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(ids));
  } catch {
    return; // not remembered: only the Shop page's "Recently viewed" row misses it
  }
  queryClient.setQueryData(recentlyViewedKey, ids);
}
