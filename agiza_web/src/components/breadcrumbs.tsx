import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { absolute } from "@/lib/site";

import { JsonLd } from "./json-ld";

export type Crumb = { label: string; href?: string };

/** Visible breadcrumbs plus their BreadcrumbList structured data. */
export function Breadcrumbs({ items, bar = true }: { items: Crumb[]; bar?: boolean }) {
  const all = [{ label: "Home", href: "/" }, ...items];
  return (
    <>
      {/* agizastore.com: a full-width light grey bar right under the header (pages start with py-6 sm:py-8). */}
      <nav
        aria-label="Breadcrumb"
        className={bar ? "relative left-1/2 -mt-6 mb-6 w-screen -translate-x-1/2 bg-bar sm:-mt-8 sm:mb-8" : "mb-4 overflow-hidden"}
      >
        <ol
          className={
            bar
              ? "mx-auto flex max-w-[1650px] flex-wrap items-center gap-x-2 gap-y-0.5 px-[15px] py-4 text-[14px] text-ink lg:px-[30px] lg:py-5"
              : "flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-muted"
          }
        >
          {all.map((c, i) => (
            <li key={i} className={i === all.length - 1 ? "flex min-w-0 items-center gap-2" : "flex shrink-0 items-center gap-2"}>
              {i > 0 ? (bar ? <span className="text-muted" aria-hidden>/</span> : <ChevronRight className="size-3.5 shrink-0" aria-hidden />) : null}
              {c.href && i < all.length - 1 ? (
                <Link href={c.href} className="text-[#0099cc] hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="line-clamp-1 text-ink" aria-current={i === all.length - 1 ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, ...(c.href ? { item: absolute(c.href) } : {}) })),
        }}
      />
    </>
  );
}
