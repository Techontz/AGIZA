/**
 * The app's only HTTP client. Adds the customer access token, refreshes it once on 401
 * (concurrent requests share one refresh), times out slow requests and turns every failure
 * into an ApiError carrying the backend's `{error: {code, message, details}}`.
 */
import { API_URL, REQUEST_TIMEOUT_MS } from '../config';
import { tokenStore } from '../auth/token-store';

export type FieldErrors = Record<string, string[] | string>;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** First message for a form field, if the server rejected it. */
  field(name: string): string | undefined {
    const details = this.details as FieldErrors | null;
    const value = details && typeof details === 'object' ? details[name] : undefined;
    return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined;
  }

  get isNetwork() {
    return this.code === 'network_error' || this.code === 'timeout';
  }
}

type Options = { method?: string; body?: unknown; auth?: boolean; query?: Record<string, string | number | boolean | undefined> };

let onSessionExpired: () => void = () => {};
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = await tokenStore.getRefresh();
  if (!refresh) return false;
  try {
    const res = await send('auth/refresh/', { method: 'POST', body: { refresh }, auth: false });
    await tokenStore.save(res.access, res.refresh);
    return true;
  } catch {
    return false;
  }
}

function url(path: string, query?: Options['query']) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${API_URL}/app/${path}${qs ? `?${qs}` : ''}`;
}

async function send(path: string, { method = 'GET', body, auth = true, query }: Options) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const access = await tokenStore.getAccess();
    if (access) headers.Authorization = `Bearer ${access}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      timedOut ? 'The server is taking too long to respond. Try again.' : "Can't reach AGIZA. Check your internet connection.",
      0,
      timedOut ? 'timeout' : 'network_error',
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      err?.message ?? (res.status >= 500 ? 'Something went wrong on our side. Please try again.' : 'Request failed.'),
      res.status,
      err?.code ?? 'error',
      err?.details ?? null,
    );
  }
  return data;
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  try {
    return (await send(path, options)) as T;
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || options.auth === false) throw e;
    refreshing ??= refreshTokens().finally(() => {
      refreshing = null;
    });
    if (await refreshing) return (await send(path, options)) as T;
    await tokenStore.clear();
    onSessionExpired();
    throw e;
  }
}

export const api = {
  get: <T>(path: string, query?: Options['query']) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  public: <T>(path: string, body?: unknown) => request<T>(path, { method: body ? 'POST' : 'GET', body, auth: false }),
};
