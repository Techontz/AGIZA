import { NextResponse } from "next/server";

import { djangoUrl } from "@/lib/server/django";
import { relayImage } from "@/lib/server/relay";

/**
 * A home banner image staff added in the admin (Home Banners, shown on the website), streamed and cached
 * like product images, so browsers never load it from Django directly.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse(null, { status: 404 });
  return relayImage(djangoUrl(`sliders/${id}/image/`), 3600);
}
