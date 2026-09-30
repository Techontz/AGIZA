"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

import { ProductImage } from "./product-image";

/** agizastore.com: thumbnails in a column on the left of the main photo (a row under it on phones). */
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse">
      <div className="relative aspect-square w-full overflow-hidden bg-surface sm:flex-1">
        <ProductImage src={current} alt={name} priority sizes="(min-width: 1280px) 520px, (min-width: 640px) 60vw, 100vw" iconClass="size-14" className="object-contain" />
      </div>
      {images.length > 1 ? (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto sm:w-[60px] sm:flex-col sm:overflow-visible" aria-label="Product photos">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Photo ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn("relative block size-[60px] overflow-hidden border bg-surface", i === index ? "border-ink" : "border-line hover:border-line-strong")}
              >
                <ProductImage src={src} alt="" sizes="60px" className="object-contain" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
