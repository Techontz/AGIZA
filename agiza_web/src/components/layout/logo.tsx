import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/cn";

/** The AGIZA wordmark: the flame "A" followed by GIZA in ink (as in the app). */
export function Logo({ size = 28, className, href = "/" }: { size?: number; className?: string; href?: string | null }) {
  const mark = (
    <span className={cn("inline-flex items-end gap-px", className)} aria-label="AGIZA" role="img">
      <Image src="/mark.png" alt="" width={Math.round(size * 0.78)} height={size} priority className="shrink-0" />
      <span className="font-bold tracking-[0.5px] text-ink" style={{ fontSize: size * 0.95, lineHeight: `${size * 1.02}px` }}>
        GIZA
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex rounded-sm" aria-label="AGIZA home">
      {mark}
    </Link>
  ) : (
    mark
  );
}
