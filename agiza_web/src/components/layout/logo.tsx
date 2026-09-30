import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/cn";

/**
 * The AGIZA wordmark: the "A" mark followed by GIZA. On the yellow header band the mark is the
 * brand's monochrome (ink) version, as on agizastore.com; elsewhere the two-tone flame mark.
 */
export function Logo({ size = 28, className, href = "/", tone = "color" }: { size?: number; className?: string; href?: string | null; tone?: "color" | "ink" }) {
  const mark = (
    <span className={cn("inline-flex items-end gap-px", className)} aria-label="AGIZA" role="img">
      <Image
        src={tone === "ink" ? "/mark-ink.png" : "/mark.png"}
        alt=""
        width={Math.round(size * (tone === "ink" ? 0.77 : 0.78))}
        height={size}
        priority
        className="shrink-0"
      />
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
