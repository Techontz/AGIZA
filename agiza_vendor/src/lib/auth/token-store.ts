import * as SecureStore from 'expo-secure-store';

const ACCESS = 'agiza.seller.access';
const REFRESH = 'agiza.seller.refresh';

/** Tokens live in the device keystore (SecureStore), cached in memory for speed. */
let cache: { access: string | null; refresh: string | null } | null = null;

async function load() {
  cache ??= {
    access: await SecureStore.getItemAsync(ACCESS),
    refresh: await SecureStore.getItemAsync(REFRESH),
  };
  return cache;
}

export const tokenStore = {
  getAccess: async () => (await load()).access,
  getRefresh: async () => (await load()).refresh,
  async save(access: string, refresh: string) {
    cache = { access, refresh };
    await SecureStore.setItemAsync(ACCESS, access);
    await SecureStore.setItemAsync(REFRESH, refresh);
  },
  async clear() {
    cache = { access: null, refresh: null };
    await SecureStore.deleteItemAsync(ACCESS);
    await SecureStore.deleteItemAsync(REFRESH);
  },
};
