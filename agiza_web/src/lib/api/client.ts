/**
 * Browser-side HTTP client. Calls go to this website's /api/proxy (which adds the session
 * from httpOnly cookies) and every failure becomes an ApiError carrying the backend's
 * `{error: {code, message, details}}`.
 */
export type FieldErrors = Record<string, string[] | string>;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  field(name: string): string | undefined {
    const details = this.details as FieldErrors | null;
    const value = details && typeof details === "object" ? details[name] : undefined;
    return Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function url(base: string, path: string, query?: Query) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${base}/${clean}${qs ? `?${qs}` : ""}`;
}

async function parse(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const message =
      err?.message ??
      (res.status === 401 ? "Please sign in to continue." : res.status >= 500 ? "Something went wrong on our side. Please try again." : "Request failed.");
    throw new ApiError(message, res.status, err?.code ?? `http_${res.status}`, err?.details ?? null);
  }
  return data;
}

async function send<T>(base: string, path: string, method: string, body?: unknown, query?: Query): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url(base, path, query), {
      method,
      headers: { Accept: "application/json", ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("You appear to be offline. Check your connection and try again.", 0, "network_error");
  }
  return (await parse(res)) as T;
}

const PROXY = "/api/proxy";

export const api = {
  get: <T>(path: string, query?: Query) => send<T>(PROXY, path, "GET", undefined, query),
  post: <T>(path: string, body?: unknown) => send<T>(PROXY, path, "POST", body ?? {}),
  patch: <T>(path: string, body?: unknown) => send<T>(PROXY, path, "PATCH", body ?? {}),
  delete: <T>(path: string) => send<T>(PROXY, path, "DELETE"),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return send<T>(PROXY, path, "POST", form);
  },
  /** Session endpoints handled by this website (cookies). */
  auth: <T>(path: string, body?: unknown, method = "POST") => send<T>("/api/auth", path, method, body),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
