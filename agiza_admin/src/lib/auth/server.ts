import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "./constants";

export interface TokenPair {
  access: string;
  refresh: string;
}

export function djangoUrl(path: string): string {
  const base = process.env.DJANGO_API_URL;
  if (!base) throw new Error("DJANGO_API_URL is not configured");
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

const secure = () => process.env.SESSION_COOKIE_SECURE === "true";

/** Seconds until the JWT's `exp` claim (decoded without verification: Django verifies). */
function secondsUntilExpiry(token: string, fallback: number): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const seconds = Math.floor(payload.exp - Date.now() / 1000);
    return seconds > 0 ? seconds : fallback;
  } catch {
    return fallback;
  }
}

export function setSessionCookies(res: NextResponse, tokens: TokenPair): void {
  const base = { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/" };
  res.cookies.set(ACCESS_COOKIE, tokens.access, { ...base, maxAge: secondsUntilExpiry(tokens.access, 900) });
  res.cookies.set(REFRESH_COOKIE, tokens.refresh, {
    ...base,
    maxAge: secondsUntilExpiry(tokens.refresh, 7 * 24 * 3600),
  });
}

export function clearSessionCookies(res: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    res.cookies.set(name, "", { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 0 });
  }
}

/** Headers identifying the real client, so Django's audit log records them. */
export function forwardedHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  const xff = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  if (xff) headers["X-Forwarded-For"] = xff;
  else if (realIp) headers["X-Forwarded-For"] = realIp;
  const ua = req.headers.get("user-agent");
  if (ua) headers["User-Agent"] = ua;
  return headers;
}

/**
 * Refresh-token rotation with in-process de-duplication.
 *
 * Django rotates and blacklists refresh tokens. When several requests arrive
 * with the same expired access token, only one refresh call is made; the
 * others reuse its result (kept for 30 s) instead of presenting a token
 * that has just been blacklisted.
 */
const inflight = new Map<string, { promise: Promise<TokenPair | null>; expires: number }>();

export function refreshTokens(refresh: string, headers: Record<string, string>): Promise<TokenPair | null> {
  const now = Date.now();
  for (const [key, entry] of inflight) if (entry.expires < now) inflight.delete(key);

  const cached = inflight.get(refresh);
  if (cached) return cached.promise;

  const promise = (async () => {
    const res = await fetch(djangoUrl("auth/refresh/"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TokenPair;
    return data.access && data.refresh ? data : null;
  })().catch(() => null);

  inflight.set(refresh, { promise, expires: now + 30_000 });
  return promise;
}

export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients and same-origin GETs may omit Origin; fall back to Sec-Fetch-Site.
    const site = req.headers.get("sec-fetch-site");
    return !site || site === "same-origin" || site === "none";
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(status: number, code: string, message: string) {
  return { status, body: { error: { code, message, details: null } } };
}
