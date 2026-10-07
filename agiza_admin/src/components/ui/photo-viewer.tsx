"use client";

import { ChevronLeft, ChevronRight, FlipHorizontal2, FlipVertical2, ImageIcon, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type View = { rotate: number; flipX: boolean; flipY: boolean; zoom: number };
const RESET: View = { rotate: 0, flipX: false, flipY: false, zoom: 1 };

/**
 * Full-screen photo viewer: click a thumbnail to enlarge it, then browse with the arrows,
 * the keyboard (← → Esc, + − to zoom) or by clicking outside the photo to close.
 * The toolbar flips, rotates and zooms the photo, like the old staff portal.
 */
export function PhotoViewer({ urls, index, onClose }: { urls: string[]; index: number | null; onClose: () => void }) {
  const [current, setCurrent] = useState(index ?? 0);
  const [view, setView] = useState<View>(RESET);
  useEffect(() => {
    if (index !== null) {
      setCurrent(index);
      setView(RESET);
    }
  }, [index]);
  const open = index !== null && urls.length > 0;
  const step = useCallback(
    (by: number) => {
      setCurrent((i) => (i + by + urls.length) % urls.length);
      setView(RESET);
    },
    [urls.length],
  );
  const zoom = useCallback((by: number) => setView((v) => ({ ...v, zoom: Math.min(4, Math.max(0.5, +(v.zoom + by).toFixed(2))) })), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "+" || e.key === "=") zoom(0.25);
      else if (e.key === "-") zoom(-0.25);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, step, zoom]);

  if (!open) return null;
  const many = urls.length > 1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button type="button" onClick={onClose} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
        <X className="size-6" />
      </button>
      {many && (
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), step(-1))}
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Previous photo"
        >
          <ChevronLeft className="size-7" />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[current]}
        alt={`Photo ${current + 1} of ${urls.length}`}
        className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain shadow-2xl transition-transform duration-200"
        style={{
          transform: `scale(${view.zoom}) rotate(${view.rotate}deg) scaleX(${view.flipX ? -1 : 1}) scaleY(${view.flipY ? -1 : 1})`,
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {many && (
        <button
          type="button"
          onClick={(e) => (e.stopPropagation(), step(1))}
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Next photo"
        >
          <ChevronRight className="size-7" />
        </button>
      )}
      <div
        className="absolute bottom-5 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {many && <span className="px-2 text-sm text-white/80">{current + 1} / {urls.length}</span>}
        {(
          [
            [FlipVertical2, "Flip vertically", () => setView((v) => ({ ...v, flipY: !v.flipY }))],
            [FlipHorizontal2, "Flip horizontally", () => setView((v) => ({ ...v, flipX: !v.flipX }))],
            [RotateCcw, "Rotate left", () => setView((v) => ({ ...v, rotate: v.rotate - 90 }))],
            [RotateCw, "Rotate right", () => setView((v) => ({ ...v, rotate: v.rotate + 90 }))],
            [ZoomOut, "Zoom out", () => zoom(-0.25)],
            [ZoomIn, "Zoom in", () => zoom(0.25)],
          ] as const
        ).map(([Icon, label, act]) => (
          <button key={label} type="button" onClick={act} className="rounded-full p-2 hover:bg-white/15" aria-label={label} title={label}>
            <Icon className="size-5" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** A small clickable thumbnail (with a "+N" badge when there are more) that opens the viewer. */
export function PhotoThumb({ urls, size = "size-12", alt = "Photo" }: { urls: string[]; size?: string; alt?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!urls.length) {
    return (
      <span className={`${size} inline-flex items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300`} title="No photo">
        <ImageIcon className="size-4" />
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(0)} className="relative block shrink-0" aria-label={`View ${urls.length} photo${urls.length > 1 ? "s" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt={alt} className={`${size} rounded-lg object-cover border border-gray-200 hover:ring-2 hover:ring-blue-400`} />
        {urls.length > 1 && (
          <span className="absolute -top-1.5 -right-1.5 rounded-full bg-gray-900 px-1.5 text-[10px] font-semibold leading-4 text-white">+{urls.length - 1}</span>
        )}
      </button>
      <PhotoViewer urls={urls} index={open} onClose={() => setOpen(null)} />
    </>
  );
}
