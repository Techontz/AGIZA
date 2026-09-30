"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Undo2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerExtraApi } from "@/lib/api/endpoints";
import { date, money } from "@/lib/format";

import { refundTone } from "../../account/returns/tones";

export default function SellerReturns() {
  const returns = useQuery({ queryKey: ["seller", "returns"], queryFn: sellerExtraApi.returns });
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Returns</h1>
      <p className="-mt-2 text-muted">
        Customers&apos; return requests for your items. AGIZA inspects each return and decides the refund; you can add your side of the story.
      </p>
      {returns.isLoading ? (
        <Skeleton className="h-64" />
      ) : returns.isError || !returns.data ? (
        <Notice tone="danger">{errorMessage(returns.error)}</Notice>
      ) : returns.data.results.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {returns.data.results.map((r) => (
              <li key={r.reference}>
                <Link href={`/seller/returns/${r.reference}`} className="flex items-center gap-3 p-4 hover:bg-canvas">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{r.reference}</span>
                      <Badge tone={refundTone(r)}>{r.status_display}</Badge>
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      Order {r.order_reference} · {r.reason} · {date(r.created_at)}
                    </span>
                    <span className="block truncate text-[13px] text-text">
                      {r.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
                    </span>
                  </span>
                  <span className="text-right text-[14px] font-medium text-ink tabular-nums">
                    {money(r.items.reduce((sum, i) => sum + Number(i.amount), 0))}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={Undo2} title="No returns" text="When a customer asks to return one of your items, it shows up here." />
      )}
    </>
  );
}
