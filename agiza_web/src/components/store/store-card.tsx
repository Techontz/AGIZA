import { MapPin } from "lucide-react";
import Link from "next/link";

import type { Store } from "@/lib/api/types";
import { plural, storeHref } from "@/lib/format";

import { StoreAvatar, Verified } from "./store-avatar";

export function StoreCard({ store }: { store: Store }) {
  return (
    <Link
      href={storeHref(store)}
      className="group flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-raised"
    >
      <StoreAvatar seller={store} size={52} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-ink group-hover:text-primary">{store.name}</span>
          {store.verified ? <Verified label={store.is_agiza ? "Official AGIZA store" : "Verified seller"} /> : null}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
          {store.city ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {store.city}
            </span>
          ) : null}
          {store.products_count !== null ? <span>{plural(store.products_count, "product")}</span> : null}
        </p>
      </div>
    </Link>
  );
}
