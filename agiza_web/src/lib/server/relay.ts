import "server-only";

import { NextResponse } from "next/server";

import { serverKeyHeader } from "./django";

/** Stream a public image from the API with long-lived caching (next/image resizes it further). */
export async function relayImage(url: string, maxAge: number) {
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: serverKeyHeader(), next: { revalidate: maxAge } });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
  if (!upstream.ok) return new NextResponse(null, { status: upstream.status === 404 ? 404 : 502 });
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
