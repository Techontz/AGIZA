"use client";

import { Filter } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Btn } from "./ui";

/** The design's "Filter" button, opening a small panel of filters. */
export function FilterPopover({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Btn variant="secondary" icon={Filter} size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Filter
        {activeCount > 0 && (
          <span className="bg-blue-600 text-white rounded-full size-4 text-[10px] flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </Btn>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 p-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
