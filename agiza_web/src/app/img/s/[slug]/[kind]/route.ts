import { NextResponse } from "next/server";

import { djangoUrl } from "@/lib/server/django";
import { relayImage } from "@/lib/server/relay";

/** A public store's logo or banner. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (!/^[\w-]+$/.test(slug) || (kind !== "logo" && kind !== "banner")) return new NextResponse(null, { status: 404 });
  return relayImage(djangoUrl(`stores/${slug}/${kind}/`), 3600);
}
