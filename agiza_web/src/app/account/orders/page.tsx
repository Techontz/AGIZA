"use client";

import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ProductImage } from "@/components/product/product-image";
import { Badge, orderTone, PAYMENT_LABEL, paymentTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { orderApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/cn";
import { date, money } from "@/lib/format";

const TABS = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "", label: "All" },
];

export default function OrdersPage() {
  const [group, setGroup] = useState("active");
  const orders = useQuery({ queryKey: ["orders", group], queryFn: () => orderApi.list(group || undefined) });
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-medium text-ink">Orders</h1>
      <div className="flex gap-1 rounded-md bg-surface p-1 shadow-card" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={group === t.value}
            onClick={() => setGroup(t.value)}
            className={cn("flex-1 rounded-sm px-3 py-2 text-[14px] font-medium", group === t.value ? "bg-ink text-white" : "text-ink hover:bg-canvas")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {orders.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : orders.isError ? (
        <Notice tone="danger">{errorMessage(orders.error)}</Notice>
      ) : !orders.data?.results.length ? (
        <EmptyState icon={Package} title="No orders here" text="Orders you place on the website or in the AGIZA app appear here." action={<ButtonLink href="/shop">Start shopping</ButtonLink>} />
      ) : (
        <ul className="space-y-3">
          {orders.data.results.map((o) => (
            <li key={o.reference}>
              <Link href={`/account/orders/${o.reference}`} className="flex gap-4 rounded-lg bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-md bg-tile">
                  <ProductImage src={o.image} alt="" sizes="64px" iconClass="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{o.reference}</span>
                    <Badge tone={orderTone(o.group, o.status)}>{o.status_display}</Badge>
                    <Badge tone={paymentTone(o.payment_status)}>{PAYMENT_LABEL[o.payment_status] ?? o.payment_status}</Badge>
                  </span>
                  <span className="mt-1 line-clamp-1 block text-[14px] text-muted">{o.item_details}</span>
                  <span className="mt-1 block text-[13px] text-muted">
                    {o.type_display} · {date(o.created_at)}
                  </span>
                </span>
                <span className="shrink-0 text-right font-semibold text-ink tabular-nums">{money(o.total, o.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
