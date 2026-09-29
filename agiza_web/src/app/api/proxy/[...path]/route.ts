/**
 * Backend-for-frontend proxy to the customer API.
 *
 * The browser calls /api/proxy/<path>; this forwards to Django's /api/app/<path> with the
 * customer's access token from the httpOnly cookie, rotating it once on a 401. Tokens never
 * reach client-side JavaScript and no business rule lives here: Django prices, validates and
 * authorises everything.
 */
import { NextRequest, NextResponse } from "next/server";

import { rewriteMediaUrls } from "@/lib/media";
import { djangoUrl } from "@/lib/server/django";
import {
  clearSessionCookies,
  forwardedHeaders,
  isSameOrigin,
  jsonError,
  refreshTokens,
  setSessionCookies,
  type TokenPair,
} from "@/lib/server/session";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

// Token lifecycle endpoints go through /api/auth/* so the cookies are managed there.
const BLOCKED = new Set(["auth/login", "auth/register", "auth/refresh", "auth/logout"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PASSTHROUGH_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control"];

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, path: string, access: string | undefined, body: ArrayBuffer | undefined) {
  const url = new URL(djangoUrl(path.endsWith("/") ? path : `${path}/`));
  req.nextUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));
  const headers: Record<string, string> = { Accept: "application/json", "X-Agiza-Channel": "web", ...forwardedHeaders(req) };
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  if (access) headers.Authorization = `Bearer ${access}`;
  return fetch(url, { method: req.method, headers, body, cache: "no-store", redirect: "manual" });
}

async function handle(req: NextRequest, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  if (segments.some((s) => s === ".." || s === ".")) {
    const e = jsonError(404, "not_found", "Not found.");
    return NextResponse.json(e.body, { status: e.status });
  }
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
  let payload: BodyInit | null = null;
  let newTokens: TokenPair | null = null;
  const isJson = (upstream.headers.get("content-type") ?? "").includes("application/json");
  if (upstream.status !== 204) {
    if (isJson) {
      let text = rewriteMediaUrls(await upstream.text());
      if (path.startsWith("auth/change-password") && upstream.ok) {
        // Django revoked every other session and issued new tokens for this one: keep them in cookies.
        const data = JSON.parse(text) as TokenPair;
        newTokens = { access: data.access, refresh: data.refresh };
        text = JSON.stringify({ detail: "Password changed." });
      }
      payload = text;
    } else {
      payload = await upstream.arrayBuffer();
    }
  }
  const res = new NextResponse(payload, { status: upstream.status, headers: responseHeaders });
  if (upstream.status === 401 || (path.startsWith("auth/delete-account") && upstream.ok)) {
    clearSessionCookies(res);
  } else if (newTokens) {
    setSessionCookies(res, newTokens);
  } else if (rotated) {
    setSessionCookies(res, rotated);
  }
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
