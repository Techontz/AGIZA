"use client";

import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/cn";
import { dateTime, money } from "@/lib/format";

import { fulfilmentTone } from "./tones";

const TABS = [
  { value: "open", label: "To prepare" },
  { value: "shipped", label: "Collected" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "", label: "All" },
];

export default function SellerOrders() {
  const router = useRouter();
  const status = useSearchParams().get("status") ?? "open";
  const list = useQuery({ queryKey: ["seller", "orders", status], queryFn: () => sellerApi.orders(status || undefined) });
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Orders</h1>
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-md bg-surface p-1 shadow-card" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={status === t.value}
            onClick={() => router.replace(`/seller/orders?status=${t.value}`)}
            className={cn("flex-1 rounded-sm px-3 py-2 text-[14px] font-medium whitespace-nowrap", status === t.value ? "bg-primary text-white" : "text-ink hover:bg-canvas")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {list.isLoading ? (
        <Skeleton className="h-48" />
      ) : list.isError ? (
        <Notice tone="danger">{errorMessage(list.error)}</Notice>
      ) : !list.data?.results.length ? (
        <EmptyState icon={ShoppingCart} title="No orders here" text="When customers buy your products, their orders appear here for you to prepare." />
      ) : (
        <ul className="space-y-3">
          {list.data.results.map((o) => (
            <li key={o.id}>
              <Link href={`/seller/orders/${o.id}`} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-4 shadow-card hover:shadow-raised">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{o.order_reference}</span>
                    <Badge tone={fulfilmentTone(o.status)}>{o.status_display}</Badge>
                  </span>
                  <span className="mt-1 block text-[13px] text-muted">
                    {o.item_count} item{o.item_count === 1 ? "" : "s"} · {o.customer}
                    {o.delivery_city ? `, ${o.delivery_city}` : ""} · {dateTime(o.created_at)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold text-ink tabular-nums">{money(o.vendor_net)}</span>
                  <span className="text-[12px] text-muted">your earnings</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
