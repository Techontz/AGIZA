import { NextRequest, NextResponse } from "next/server";

import { REFRESH_COOKIE } from "@/lib/session-cookies";

/**
 * Browsing never needs an account. Only the pages below do; without a session the visitor
 * is sent to sign in and brought back. Django still authorises every request.
 */
const PROTECTED = ["/account", "/checkout"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (req.cookies.get(REFRESH_COOKIE)?.value) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/account/:path*", "/checkout/:path*"],
};
