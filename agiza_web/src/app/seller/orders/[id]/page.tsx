"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";
import { dateTime, money } from "@/lib/format";

import { fulfilmentTone, settlementTone } from "../tones";

export default function SellerOrderPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const key = ["seller", "order", Number(id)];
  const order = useQuery({ queryKey: key, queryFn: () => sellerApi.order(Number(id)) });
  const act = useMutation({
    mutationFn: (action: "accept" | "ready") => sellerApi.orderAction(Number(id), action),
    onSuccess: (o) => {
      client.setQueryData(key, o);
      client.invalidateQueries({ queryKey: ["seller", "orders"] });
      client.invalidateQueries({ queryKey: ["seller", "dashboard"] });
      toast.success(o.status === "ready" ? "Marked ready — AGIZA will collect it" : "Order accepted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (order.isLoading) return <Skeleton className="h-96" />;
  if (order.isError || !order.data) return <Notice tone="danger">{errorMessage(order.error)}</Notice>;
  const o = order.data;
  return (
    <>
      <Link href="/seller/orders" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Order {o.order_reference}</h1>
          <p className="text-[14px] text-muted">
            For {o.customer}
            {o.delivery_city ? ` in ${o.delivery_city}` : ""} · {dateTime(o.created_at)}
          </p>
        </div>
        <Badge tone={fulfilmentTone(o.status)} className="px-3 py-1 text-[13px]">
          {o.status_display}
        </Badge>
      </div>
      {o.can_accept || o.can_mark_ready ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 bg-primary-soft">
          <p className="text-[15px] text-ink">{o.can_accept ? "Accept the order and start preparing the items." : "When the items are packed, mark them ready so AGIZA can collect them."}</p>
          {o.can_accept ? (
            <Button icon={<Check className="size-4" />} loading={act.isPending} onClick={() => act.mutate("accept")}>
              Accept order
            </Button>
          ) : (
            <Button icon={<PackageCheck className="size-4" />} loading={act.isPending} onClick={() => act.mutate("ready")}>
              Ready for pickup
            </Button>
          )}
        </Card>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-ink">Items to prepare</h2>
          <ul className="divide-y divide-line">
            {o.items?.map((i) => (
              <li key={i.sku} className="flex justify-between gap-3 py-2.5">
                <span>
                  <span className="block font-medium text-ink">
                    {i.quantity} × {i.name}
                  </span>
                  <span className="text-[13px] text-muted">
                    {i.variant_name ? `${i.variant_name} · ` : ""}SKU {i.sku} · {money(i.unit_price)} each
                  </span>
                </span>
                <span className="font-medium text-ink tabular-nums">{money(i.line_total)}</span>
              </li>
            ))}
          </ul>
          {o.events?.length ? (
            <ol className="mt-4 space-y-1.5 border-t border-line pt-3 text-[13px]">
              {o.events.map((e, i) => (
                <li key={i} className="flex justify-between gap-3 text-muted">
                  <span className="text-ink">
                    {e.by_you ? e.status_display : e.note || e.status_display}
                    {e.by_you ? " (you)" : ""}
                  </span>
                  <span>{dateTime(e.at)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-ink">Earnings</h2>
          <Row label="Sale" value={money(o.subtotal)} />
          <Row label="AGIZA commission" value={`− ${money(o.commission)}`} />
          <div className="my-1 border-t border-line" />
          <Row label="Your earnings" value={money(o.vendor_net)} strong />
          <p className="mt-2 flex items-center gap-2 text-[13px]">
            <Badge tone={settlementTone(o.settlement_status)}>{o.settlement_display}</Badge>
          </p>
          {o.payout ? <p className="mt-1 text-[13px] text-muted">Paid in {o.payout}</p> : null}
        </Card>
      </div>
    </>
  );
}
