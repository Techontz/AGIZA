"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { SITE_URL } from "@/lib/site";

export type CarouselBanner = { id: number; title: string; link: string | null; image: string };

const INTERVAL_MS = 6000;

/** A link on this website (relative, or on the site's own host) becomes a path for next/link; anything else is external. */
function resolveLink(link: string | null): { href: string; external: boolean } | null {
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return { href: link, external: false };
  try {
    const url = new URL(link);
    const own = new URL(SITE_URL);
    const bare = (host: string) => host.replace(/^www\./, "");
    if (bare(url.host) === bare(own.host)) return { href: `${url.pathname}${url.search}${url.hash}` || "/", external: false };
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { href: url.toString(), external: true };
  } catch {
    return null;
  }
}

/**
 * The home page's hero: staff banners (Website Homepage → Banners) sliding every few seconds,
 * paused while hovered or focused; arrows, dots and the arrow keys move between them.
 */
export function BannerCarousel({ banners, label = "Featured offers" }: { banners: CarouselBanner[]; label?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = banners.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndex((i) => (i + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    }
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      className="group/carousel relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      onKeyDown={onKeyDown}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        go(end < start ? index + 1 : index - 1);
      }}
    >
      <div className="relative aspect-video overflow-hidden rounded-md bg-canvas sm:aspect-[21/8]">
        <ul
          className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live={paused ? "polite" : "off"}
        >
          {banners.map((banner, i) => {
            const active = i === index;
            const target = resolveLink(banner.link);
            const content = (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- staff banners are relayed from the API as-is, outside next/image's /img routes */}
                <img
                  src={banner.image}
                  alt={banner.title}
                  className="h-full w-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  decoding="async"
                />
                {banner.title ? (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-5 pt-12 pb-9 sm:px-8 sm:pb-11">
                    <span className="block max-w-2xl text-[18px] leading-snug font-semibold text-white sm:text-[28px]">{banner.title}</span>
                  </span>
                ) : null}
              </>
            );
            let slide: ReactNode = content;
            if (target?.external) {
              slide = (
                <a href={target.href} target="_blank" rel="noopener noreferrer" className="relative block h-full" tabIndex={active ? 0 : -1}>
                  {content}
                </a>
              );
            } else if (target) {
              slide = (
                <Link href={target.href} className="relative block h-full" tabIndex={active ? 0 : -1}>
                  {content}
                </Link>
              );
            } else {
              slide = <div className="relative h-full">{content}</div>;
            }
            return (
              <li
                key={banner.id}
                className="h-full w-full shrink-0"
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                aria-hidden={!active}
              >
                {slide}
              </li>
            );
          })}
        </ul>

        {count > 1 ? (
          <>
            <ArrowButton side="left" label="Previous banner" onClick={() => go(index - 1)} />
            <ArrowButton side="right" label="Next banner" onClick={() => go(index + 1)} />
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
              {banners.map((banner, i) => (
                <button
                  key={banner.id}
                  type="button"
                  aria-label={`Show banner ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => go(i)}
                  className={cn(
                    "h-2.5 rounded-full border border-white/80 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow",
                    i === index ? "w-6 bg-yellow" : "w-2.5 bg-white/60 hover:bg-white",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function ArrowButton({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow sm:flex",
        "opacity-0 transition-opacity group-hover/carousel:opacity-100 focus-visible:opacity-100",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
