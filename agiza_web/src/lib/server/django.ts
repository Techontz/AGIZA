import "server-only";

/**
 * Server-side access to the AGIZA API. Pages render public catalogue data on the server
 * (indexable, fast); browsers never call Django directly. Signed-in requests go through
 * /api/proxy with the httpOnly session cookies instead.
 */
import { rewriteMediaUrls } from "@/lib/media";

export function djangoUrl(path: string): string {
  // Production falls back to the public AGIZA API so a fresh deployment works without setup.
  const base =
    process.env.DJANGO_API_URL || (process.env.NODE_ENV === "production" ? "https://agizastore.xyz/api" : undefined);
  if (!base) throw new Error("DJANGO_API_URL is not configured");
  return `${base.replace(/\/+$/, "")}/app/${path.replace(/^\/+/, "")}`;
}

/** Identifies this website's server to the API (skips the per-visitor anonymous limit on public reads). */
export function serverKeyHeader(): Record<string, string> {
  const key = process.env.STOREFRONT_SERVER_KEY;
  return key ? { "X-Storefront-Key": key } : {};
}

export class UpstreamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function withQuery(path: string, query?: Query) {
  const url = new URL(djangoUrl(path.endsWith("/") || path.includes("?") ? path : `${path}/`));
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

/**
 * GET a public endpoint. Responses are cached for `revalidate` seconds (Next data cache),
 * so popular pages don't hit Django on every view. Returns null for 404.
 */
export async function publicGet<T>(path: string, query?: Query, revalidate = 60): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(withQuery(path, query), {
      headers: { Accept: "application/json", ...serverKeyHeader() },
      next: { revalidate, tags: ["catalog"] },
    });
  } catch {
    throw new UpstreamError(503, "The AGIZA server is unreachable.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new UpstreamError(res.status, `AGIZA API responded ${res.status}`);
  return JSON.parse(rewriteMediaUrls(await res.text())) as T;
}

/** Like publicGet but a missing resource is an error (lists, config). */
export async function publicList<T>(path: string, query?: Query, revalidate = 60): Promise<T> {
  const data = await publicGet<T>(path, query, revalidate);
  if (data === null) throw new UpstreamError(404, `${path} not found`);
  return data;
}
