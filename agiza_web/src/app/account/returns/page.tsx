"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { returnApi } from "@/lib/api/endpoints";
import { date, money } from "@/lib/format";

import { refundTone } from "./tones";

export default function ReturnsPage() {
  const list = useQuery({ queryKey: ["returns"], queryFn: returnApi.list });
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-medium text-ink">Returns & refunds</h1>
      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : list.isError ? (
        <Notice tone="danger">{errorMessage(list.error)}</Notice>
      ) : !list.data?.results.length ? (
        <EmptyState icon={RotateCcw} title="No returns" text="To return something, open the delivered order and choose Return items." />
      ) : (
        <ul className="space-y-3">
          {list.data.results.map((r) => (
            <li key={r.reference}>
              <Link href={`/account/returns/${r.reference}`} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-4 shadow-card hover:shadow-raised">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{r.reference}</span>
                    <Badge tone={refundTone(r)}>{r.status_display}</Badge>
                  </span>
                  <span className="mt-1 line-clamp-1 block text-[14px] text-muted">{r.items}</span>
                  <span className="text-[13px] text-muted">
                    Order {r.order} · {date(r.created_at)}
                  </span>
                </span>
                <span className="text-right font-semibold text-ink">{money(r.refund_amount ?? r.value)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
