"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

import { ProductImage } from "./product-image";

export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? null;
  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-tile shadow-card lg:flex-1">
        <ProductImage src={current} alt={name} priority sizes="(min-width: 1024px) 560px, 100vw" iconClass="size-14" />
      </div>
      {images.length > 1 ? (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-visible" aria-label="Product photos">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Photo ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "relative block size-16 overflow-hidden rounded-md border-2 bg-tile lg:size-20",
                  i === index ? "border-brand" : "border-transparent hover:border-line-strong",
                )}
              >
                <ProductImage src={src} alt="" sizes="80px" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
