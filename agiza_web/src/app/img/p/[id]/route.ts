import { NextResponse } from "next/server";

import { djangoUrl } from "@/lib/server/django";
import { relayImage } from "@/lib/server/relay";

/**
 * A public product image, streamed from the API (which only serves images of products
 * customers can see). next/image resizes it; browsers never load originals from Django.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse(null, { status: 404 });
  return relayImage(djangoUrl(`images/${id}/`), 86400);
}
