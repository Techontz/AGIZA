import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { absolute } from "@/lib/site";

import { JsonLd } from "./json-ld";

export type Crumb = { label: string; href?: string };

/** Visible breadcrumbs plus their BreadcrumbList structured data. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const all = [{ label: "Home", href: "/" }, ...items];
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 overflow-hidden">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-muted">
          {all.map((c, i) => (
            <li key={i} className={i === all.length - 1 ? "flex min-w-0 items-center gap-1" : "flex shrink-0 items-center gap-1"}>
              {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden /> : null}
              {c.href && i < all.length - 1 ? (
                <Link href={c.href} className="hover:text-primary">
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
