/**
 * Single entry point for talking to Django from the browser.
 * Every call goes through the Next.js proxy (/api/proxy/*), which attaches the
 * httpOnly-cookie JWT. Components never call fetch() directly.
 */
import { shrinkImage } from "../shrink-image";

import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: ApiErrorBody["error"]["details"] = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field errors from a 400 validation response, flattened to {field: message}. */
  get fieldErrors(): Record<string, string> {
    if (!this.details || Array.isArray(this.details)) return {};
    return Object.fromEntries(
      Object.entries(this.details).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]),
    );
  }
}

export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;
export type QueryParams = Record<string, QueryValue>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, String(v)));
    else qs.append(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

/** Photos in an upload are shrunk first (see shrinkImage) so they fit the proxy's 4.5 MB request limit. */
async function shrinkFormImages(form: FormData): Promise<FormData> {
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out.append(key, value);
    else {
      const file = value instanceof File ? await shrinkImage(value) : value;
      out.append(key, file, value instanceof File ? file.name : undefined);
    }
  }
  return out;
}

async function request<T>(url: string, { method = "GET", query, body, signal }: RequestOptions = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (isForm) body = await shrinkFormImages(body as FormData);
  let res: Response;
  try {
    res = await fetch(`${url}${buildQuery(query)}`, {
      method,
      signal,
      credentials: "same-origin",
      headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network_error", "Network error. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    if (res.status === 401 && url.startsWith("/api/proxy")) redirectToLogin();
    throw new ApiError(
      res.status,
      error?.code ?? "http_error",
      error?.message ?? `Request failed (${res.status}).`,
      error?.details ?? null,
    );
  }
  return data as T;
}

/** Call a Django endpoint, e.g. api.get("audit-logs", { page: 2 }). */
export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    request<T>(`/api/proxy/${path}`, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(`/api/proxy/${path}`, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(`/api/proxy/${path}`, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(`/api/proxy/${path}`, { method: "PUT", body }),
  delete: <T = void>(path: string) => request<T>(`/api/proxy/${path}`, { method: "DELETE" }),
};

/** Session endpoints handled by Next.js (cookie management), not proxied. */
export const session = {
  login: <T>(body: { email: string; password: string }) => request<T>("/api/auth/login", { method: "POST", body }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
};
