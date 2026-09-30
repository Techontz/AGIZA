import { MapPin } from "lucide-react";
import Link from "next/link";

import type { Store } from "@/lib/api/types";
import { plural, storeHref } from "@/lib/format";

import { RatingCount } from "../product/stars";
import { StoreAvatar, Verified } from "./store-avatar";

/** A store tile in the site's bordered style: logo, name, rating, where it is and a "Visit store" link. */
export function StoreCard({ store }: { store: Store }) {
  return (
    <Link href={storeHref(store)} className="group flex h-full items-center gap-4 border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <StoreAvatar seller={store} size={64} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-[16px] font-medium text-ink">{store.name}</span>
          {store.verified ? <Verified label={store.is_agiza ? "Official AGIZA store" : "Verified seller"} /> : null}
        </p>
        <RatingCount rating={store.rating} count={store.rating_count ?? 0} className="mt-1" />
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
          {store.city ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {store.city}
            </span>
          ) : null}
          {store.products_count !== null ? <span>{plural(store.products_count, "product")}</span> : null}
        </p>
        <span className="mt-2 inline-block text-[14px] text-link group-hover:underline">Visit store</span>
      </div>
    </Link>
  );
}
