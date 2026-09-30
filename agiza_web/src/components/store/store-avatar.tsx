import { BadgeCheck } from "lucide-react";
import Image from "next/image";

import type { Seller } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

/** A store's logo, AGIZA's flame for AGIZA, or the store's initials in brand colours. */
export function StoreAvatar({ seller, size = 40, className }: { seller: Pick<Seller, "name" | "logo" | "is_agiza">; size?: number; className?: string }) {
  const box = { width: size, height: size };
  if (seller.is_agiza) {
    return (
      <span style={box} className={cn("flex shrink-0 items-center justify-center rounded-full border border-line bg-surface", className)}>
        <Image src="/mark.png" alt="" width={Math.round(size * 0.42)} height={Math.round(size * 0.54)} />
      </span>
    );
  }
  if (seller.logo) {
    return (
      <span style={box} className={cn("relative shrink-0 overflow-hidden rounded-full border border-line bg-surface", className)}>
        <Image src={seller.logo} alt="" fill sizes={`${size * 2}px`} className="object-cover" />
      </span>
    );
  }
  return (
    <span
      style={{ ...box, fontSize: Math.max(11, size * 0.36) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-yellow font-bold text-ink", className)}
      aria-hidden
    >
      {initials(seller.name)}
    </span>
  );
}

export function Verified({ className, label = "Verified seller" }: { className?: string; label?: string }) {
  return <BadgeCheck className={cn("size-4 shrink-0 text-info", className)} aria-label={label} role="img" />;
}
