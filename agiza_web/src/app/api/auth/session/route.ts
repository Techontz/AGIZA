import { NextRequest, NextResponse } from "next/server";

import { djangoUrl } from "@/lib/server/django";
import {
  clearSessionCookies,
  forwardedHeaders,
  refreshTokens,
  setSessionCookies,
  type TokenPair,
} from "@/lib/server/session";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

/**
 * Who is signed in: {customer, store} (store = the seller area status, or null).
 * Anonymous visitors get {customer: null}.
 */
export async function GET(req: NextRequest) {
  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) return NextResponse.json({ customer: null, store: null });
  let rotated: TokenPair | null = null;
  const headers = forwardedHeaders(req);
  const get = (path: string) =>
    fetch(djangoUrl(path), { headers: { Accept: "application/json", Authorization: `Bearer ${access}`, ...headers }, cache: "no-store" });

  if (!access) {
    rotated = await refreshTokens(refresh, headers);
    access = rotated?.access;
  }
  let me = access ? await get("me/").catch(() => null) : null;
  if (me?.status === 401 && !rotated) {
    rotated = await refreshTokens(refresh, headers);
    access = rotated?.access;
    me = access ? await get("me/").catch(() => null) : null;
  }
  if (!me || !me.ok) {
    const res = NextResponse.json({ customer: null, store: null });
    if (me?.status === 401 || !access) clearSessionCookies(res);
    return res;
  }
  const customer = await me.json();
  const storeRes = await get("seller/store/").catch(() => null);
  const store = storeRes?.ok ? await storeRes.json() : null;
  const res = NextResponse.json({
    customer,
    store: store ? { name: store.name, slug: store.slug, approval_status: store.approval_status, can_sell: store.can_sell } : null,
  });
  if (rotated) setSessionCookies(res, rotated);
  return res;
}
