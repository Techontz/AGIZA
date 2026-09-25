/**
 * Backend-for-frontend proxy.
 *
 * The browser calls /api/proxy/<django path>; this handler forwards the request
 * to Django with the access token taken from the httpOnly cookie. On a 401 it
 * rotates the refresh token once and retries. JWTs never reach client-side JS,
 * and Django remains the only backend: no business logic lives here.
 */
import { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";
import {
  clearSessionCookies,
  djangoUrl,
  forwardedHeaders,
  isSameOrigin,
  jsonError,
  refreshTokens,
  setSessionCookies,
  type TokenPair,
} from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// Token lifecycle endpoints must go through /api/auth/* so cookies are managed.
const BLOCKED = new Set(["auth/login", "auth/refresh", "auth/logout"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PASSTHROUGH_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control"];

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, path: string, access: string | undefined, body: ArrayBuffer | undefined) {
  const url = new URL(djangoUrl(path.endsWith("/") ? path : `${path}/`));
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));

  const headers: Record<string, string> = { Accept: "application/json", ...forwardedHeaders(req) };
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  if (access) headers.Authorization = `Bearer ${access}`;

  return fetch(url, { method: req.method, headers, body, cache: "no-store", redirect: "manual" });
}

async function handle(req: NextRequest, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const path = segments.map(encodeURIComponent).join("/");

  if (BLOCKED.has(path.replace(/\/+$/, ""))) {
    const e = jsonError(404, "not_found", "Not found.");
    return NextResponse.json(e.body, { status: e.status });
  }
  if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    const e = jsonError(403, "forbidden_origin", "Cross-origin request rejected.");
    return NextResponse.json(e.body, { status: e.status });
  }

  const body = SAFE_METHODS.has(req.method) ? undefined : await req.arrayBuffer();
  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let rotated: TokenPair | null = null;

  const tryRefresh = async () => {
    if (!refresh) return false;
    rotated = await refreshTokens(refresh, forwardedHeaders(req));
    if (rotated) access = rotated.access;
    return Boolean(rotated);
  };

  if (!access && refresh) await tryRefresh();

  let upstream: Response;
  try {
    upstream = await forward(req, path, access, body);
    if (upstream.status === 401 && !rotated && (await tryRefresh())) {
      upstream = await forward(req, path, access, body);
    }
  } catch {
    const e = jsonError(503, "backend_unavailable", "The AGIZA server is unreachable. Please try again.");
    return NextResponse.json(e.body, { status: e.status });
  }

  const responseHeaders = new Headers();
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const payload = upstream.status === 204 ? null : await upstream.arrayBuffer();
  const res = new NextResponse(payload, { status: upstream.status, headers: responseHeaders });

  if (upstream.status === 401) {
    clearSessionCookies(res);
  } else if (path.startsWith("auth/change-password") && upstream.ok) {
    // Django revoked every session for this user; end this one too.
    clearSessionCookies(res);
  } else if (rotated) {
    setSessionCookies(res, rotated);
  }
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
