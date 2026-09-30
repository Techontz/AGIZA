import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session-cookies";

import { djangoUrl } from "./django";

/**
 * Customer sessions. The customer JWTs live only in httpOnly cookies set by this server;
 * client-side code never sees a token. Django verifies every request.
 */
export interface TokenPair {
  access: string;
  refresh: string;
}

/** Secure cookies in production unless explicitly disabled (e.g. testing a production build over http). */
const secure = () =>
  process.env.SESSION_COOKIE_SECURE === "true" ||
  (process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_SECURE !== "false");

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
  res.cookies.set(REFRESH_COOKIE, tokens.refresh, { ...base, maxAge: secondsUntilExpiry(tokens.refresh, 30 * 24 * 3600) });
}

export function clearSessionCookies(res: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    res.cookies.set(name, "", { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: 0 });
  }
}

/** Headers identifying the real visitor, so Django's throttling and audit log see them. */
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

/** Refresh-token rotation, de-duplicated so parallel requests don't present a just-blacklisted token. */
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
