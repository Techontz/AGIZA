import { Package } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/cn";

/** A product photo (resized by next/image) or a neutral placeholder when there is none. */
export function ProductImage({
  src,
  alt,
  sizes,
  priority,
  className,
  iconClass = "size-8",
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  iconClass?: string;
}) {
  if (!src) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-tile text-subtle", className)} role="img" aria-label={alt}>
        <Package className={iconClass} aria-hidden />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}
