import { NextRequest, NextResponse } from "next/server";

import { djangoUrl } from "@/lib/server/django";
import { clearSessionCookies, forwardedHeaders, isSameOrigin, jsonError } from "@/lib/server/session";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session-cookies";

/** Revokes the refresh token in Django (best effort) and always clears the cookies. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    const e = jsonError(403, "forbidden_origin", "Cross-origin request rejected.");
    return NextResponse.json(e.body, { status: e.status });
  }
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    await fetch(djangoUrl("auth/logout/"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...forwardedHeaders(req),
      },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    }).catch(() => undefined);
  }
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookies(res);
  return res;
}
