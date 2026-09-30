"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The agizastore.com product tabs (Description, Specifications, Reviews). Every panel is rendered
 * on the server; inactive ones are only hidden, so crawlers still read them.
 */
export function ProductTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  // Links such as "#tab-reviews" (the rating under the title) open their tab.
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.replace(/^#(tab-)?/, "");
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [tabs]);
  return (
    <div>
      <div role="tablist" aria-label="Product information" className="no-scrollbar flex gap-8 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 py-3.5 text-[18px] font-semibold whitespace-nowrap sm:text-[20px]",
              active === t.id ? "border-yellow text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="pt-7">
          {t.content}
        </div>
      ))}
    </div>
  );
}
