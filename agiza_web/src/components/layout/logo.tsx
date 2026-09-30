import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The official AGIZA logo (black), as shown on agizastore.com: `public/logo-agiza-black.png`, a
 * local copy of the brand's own logo file, cropped to the artwork (651×235). `width` is the
 * visible width of the artwork; the height follows its aspect ratio.
 */
const RATIO = 235 / 651;

export function Logo({ width = 210, className, href = "/" }: { width?: number; className?: string; href?: string | null }) {
  const image = (
    <Image
      src="/logo-agiza-black.png"
      alt="AGIZA"
      width={width}
      height={Math.round(width * RATIO)}
      priority
      className={cn("block shrink-0", className)}
      style={{ width, height: Math.round(width * RATIO) }}
    />
  );
  return href ? (
    <Link href={href} className="inline-flex shrink-0 rounded-sm" aria-label="AGIZA home">
      {image}
    </Link>
  ) : (
    image
  );
}
