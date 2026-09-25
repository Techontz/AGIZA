import { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/constants";
import { clearSessionCookies, djangoUrl, forwardedHeaders, isSameOrigin, refreshTokens } from "@/lib/auth/server";

async function djangoLogout(access: string, refresh: string, headers: Record<string, string>) {
  return fetch(djangoUrl("auth/logout/"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${access}`, ...headers },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
}

/** Blacklists the refresh token in Django (best effort) and always clears the cookies. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: { code: "forbidden_origin", message: "Cross-origin request rejected.", details: null } },
      { status: 403 },
    );
  }
  const headers = forwardedHeaders(req);
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

  try {
    if (refresh) {
      const first = access ? await djangoLogout(access, refresh, headers) : null;
      if (!first || first.status === 401) {
        // Access token expired: rotate once so the (new) refresh token can be blacklisted.
        const rotated = await refreshTokens(refresh, headers);
        if (rotated) await djangoLogout(rotated.access, rotated.refresh, headers);
      }
    }
  } catch {
    // Django unreachable: still end the browser session.
  }

  const res = new NextResponse(null, { status: 204 });
  clearSessionCookies(res);
  return res;
}
