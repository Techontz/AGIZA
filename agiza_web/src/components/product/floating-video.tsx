"use client";

import { Play, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { ProductVideo } from "@/lib/api/types";

const NAME = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" } as const;

/**
 * Pinduoduo-style product video: a small portrait player floating over the right side of the main
 * product photo. YouTube and TikTok play muted and looping in their own players (nothing is re-hosted);
 * Instagram can't be embedded at this size, so it shows a preview that opens the original.
 * The customer closes it with X (remembered for this product during the visit).
 */
export function FloatingVideo({ video, productId }: { video: ProductVideo; productId: number }) {
  const key = `agiza-video-closed-${productId}`;
  const [closed, setClosed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(key)) setClosed(true);
    } catch {
      /* storage unavailable: show the video */
    }
    // Muted autoplay where the provider allows it, unless the customer asked for less motion.
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (video.embeddable && !calm) setPlaying(true);
  }, [key, video.embeddable]);

  if (closed) return null;
  const close = () => {
    setClosed(true);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="absolute right-[3%] bottom-[10%] z-10 aspect-[9/16] w-[28%] min-w-[84px] max-w-[168px] overflow-hidden rounded-xl bg-black shadow-[0_6px_20px_rgba(0,0,0,0.28)] ring-2 ring-white"
      role="region"
      aria-label={`Product video on ${NAME[video.provider]}`}
    >
      {playing && video.embed_url ? (
        <iframe
          src={video.embed_url}
          title={`Product video (${NAME[video.provider]})`}
          allow="autoplay; encrypted-media; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className={
            video.vertical || video.provider === "tiktok"
              ? "absolute inset-0 size-full border-0"
              : // A landscape YouTube video fills the portrait frame (cropped at the sides).
                "absolute top-0 left-1/2 h-full aspect-video max-w-none -translate-x-1/2 border-0"
          }
        />
      ) : (
        <button
          type="button"
          onClick={() => (video.embeddable ? setPlaying(true) : window.open(video.url, "_blank", "noopener,noreferrer"))}
          className="group absolute inset-0 flex items-center justify-center bg-gradient-to-b from-neutral-700 to-neutral-950"
          aria-label={video.embeddable ? "Play product video" : `Watch the product video on ${NAME[video.provider]}`}
        >
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- provider thumbnail (allowed in the CSP)
            <img src={video.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover opacity-90" />
          ) : null}
          <span className="relative flex size-9 items-center justify-center rounded-full bg-white/90 text-ink shadow transition group-hover:scale-105">
            <Play className="size-4 translate-x-px fill-current" aria-hidden />
          </span>
          {!video.embeddable ? (
            <span className="absolute inset-x-1 bottom-1.5 text-center text-[10px] leading-tight font-medium text-white">
              Watch on {NAME[video.provider]}
            </span>
          ) : null}
        </button>
      )}
      <button
        type="button"
        onClick={close}
        aria-label="Close video"
        className="absolute top-1 right-1 z-10 flex size-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
