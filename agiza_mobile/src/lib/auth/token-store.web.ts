const ACCESS = 'agiza.access';
const REFRESH = 'agiza.refresh';

/** Web preview only (no device keystore in a browser): tokens kept in localStorage. */
const read = (key: string) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // storage blocked: stay signed out
  }
};

export const tokenStore = {
  getAccess: async () => read(ACCESS),
  getRefresh: async () => read(REFRESH),
  async save(access: string, refresh: string) {
    write(ACCESS, access);
    write(REFRESH, refresh);
  },
  async clear() {
    write(ACCESS, null);
    write(REFRESH, null);
  },
};
