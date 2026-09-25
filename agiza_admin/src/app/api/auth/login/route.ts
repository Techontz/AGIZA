import { NextRequest, NextResponse } from "next/server";

import { djangoUrl, forwardedHeaders, isSameOrigin, jsonError, setSessionCookies } from "@/lib/auth/server";

/** Exchanges credentials with Django and stores the JWTs in httpOnly cookies. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    const e = jsonError(403, "forbidden_origin", "Cross-origin request rejected.");
    return NextResponse.json(e.body, { status: e.status });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    const e = jsonError(400, "invalid_json", "Request body must be JSON.");
    return NextResponse.json(e.body, { status: e.status });
  }

  let upstream: Response;
  try {
    upstream = await fetch(djangoUrl("auth/login/"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...forwardedHeaders(req) },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    const e = jsonError(503, "backend_unavailable", "The AGIZA server is unreachable. Please try again.");
    return NextResponse.json(e.body, { status: e.status });
  }

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok || !data?.access) {
    return NextResponse.json(data ?? jsonError(502, "bad_gateway", "Unexpected response.").body, {
      status: upstream.ok ? 502 : upstream.status,
    });
  }

  // Tokens stay server-side; the browser only receives the user profile.
  const res = NextResponse.json({ user: data.user });
  setSessionCookies(res, { access: data.access, refresh: data.refresh });
  return res;
}
