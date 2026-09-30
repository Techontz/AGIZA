"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleX, MapPin, Truck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ProductImage } from "@/components/product/product-image";
import { StoreAvatar } from "@/components/store/store-avatar";
import { Badge, orderTone, PAYMENT_LABEL, paymentTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Card, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { orderApi } from "@/lib/api/endpoints";
import type { OrderDetail } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { dateTime, money, productHref, storeHref } from "@/lib/format";

export function OrderView({ reference }: { reference: string }) {
  const client = useQueryClient();
  const params = useSearchParams();
  const key = ["orders", "detail", reference];
  const order = useQuery({ queryKey: key, queryFn: () => orderApi.get(reference) });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  // Back from the payment page: ask AGIZA to confirm the payment with the provider.
  const check = useMutation({
    mutationFn: () => orderApi.checkPayment(reference),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: key });
      if (r.payment.status === "fully_paid") toast.success("Payment received. Thank you!");
    },
  });
  const checkPayment = check.mutate;
  useEffect(() => {
    if (params.get("payment") === "check") checkPayment();
  }, [params, checkPayment]);

  const pay = useMutation({
    mutationFn: () => orderApi.pay(reference),
    onSuccess: (p) => p.checkout_url && window.location.assign(p.checkout_url),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => orderApi.cancel(reference, reason),
    onSuccess: (o) => {
      client.setQueryData(key, o);
      client.invalidateQueries({ queryKey: ["orders"] });
      setCancelling(false);
      toast.success("Order cancelled");
    },
  });

  if (order.isLoading) return <Skeleton className="h-96" />;
  if (order.isError || !order.data) return <Notice tone="danger">{errorMessage(order.error)}</Notice>;
  const o: OrderDetail = order.data;
  const multiSeller = (o.sellers?.length ?? 0) > 1;

  return (
    <div className="space-y-4">
      <Link href="/account/orders" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All orders
      </Link>
      {params.get("placed") ? (
        <Notice tone="success">
          <span className="flex items-center gap-2 font-medium">
            <Check className="size-4" aria-hidden /> Order placed — thank you! We&apos;ll keep you updated here and by notification.
          </span>
        </Notice>
      ) : null}
      {params.get("payment") === "failed" ? <Notice tone="warning">The payment couldn&apos;t be started. You can try again below or pay later.</Notice> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Order {o.reference}</h1>
          <p className="text-[14px] text-muted">
            {o.type_display} · placed {dateTime(o.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={orderTone(o.group, o.status)} className="px-3 py-1 text-[13px]">
            {o.status_display}
          </Badge>
          <Badge tone={paymentTone(o.payment.status)} className="px-3 py-1 text-[13px]">
            {PAYMENT_LABEL[o.payment.status] ?? o.payment.status}
          </Badge>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-ink">Tracking</h2>
            {o.timeline.cancelled ? (
              <p className="flex items-center gap-2 font-medium text-danger">
                <CircleX className="size-5" aria-hidden /> Cancelled {dateTime(o.timeline.cancelled_at)}
              </p>
            ) : (
              <ol className="relative space-y-4">
                {o.timeline.steps.map((s, i) => (
                  <li key={s.key} className="relative flex gap-3">
                    {i < o.timeline.steps.length - 1 ? (
                      <span aria-hidden className={cn("absolute top-6 left-[11px] h-[calc(100%-8px)] w-0.5", s.state === "completed" ? "bg-brand" : "bg-line")} />
                    ) : null}
                    <span
                      className={cn(
                        "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                        s.state === "completed" ? "border-brand bg-brand text-white" : s.state === "current" ? "border-brand bg-surface" : "border-line-strong bg-surface",
                      )}
                    >
                      {s.state === "completed" ? <Check className="size-3.5" aria-hidden /> : s.state === "current" ? <span className="size-2 rounded-full bg-brand" /> : null}
                    </span>
                    <span>
                      <span className={cn("block text-[15px]", s.state === "pending" ? "text-muted" : "font-medium text-ink")}>{s.label}</span>
                      {s.at ? <span className="text-[13px] text-muted">{dateTime(s.at)}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {o.delivery ? (
              <p className="mt-4 flex items-center gap-2 rounded-md bg-canvas p-3 text-[14px] text-ink">
                <Truck className="size-4 text-brand" aria-hidden /> Delivery {o.delivery.reference}: {o.delivery.status_display}
                {o.delivery.delivered_at ? ` · ${dateTime(o.delivery.delivered_at)}` : o.delivery.scheduled_at ? ` · scheduled ${dateTime(o.delivery.scheduled_at)}` : ""}
              </p>
            ) : null}
            {o.cargo?.length ? (
              <ul className="mt-4 space-y-1.5 text-[14px]">
                {o.cargo.map((c) => (
                  <li key={c.key} className="flex justify-between gap-3">
                    <span className={c.status === "completed" ? "text-ink" : "text-muted"}>{c.label}</span>
                    <span className="text-muted">{c.at ? dateTime(c.at) : c.expected ? `Expected ${c.expected}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {o.sellers?.length ? (
            <Card>
              <h2 className="mb-1 text-lg font-semibold text-ink">{multiSeller ? `From ${o.sellers.length} stores` : "Seller"}</h2>
              {multiSeller ? <p className="mb-3 text-[13px] text-muted">One order and one payment — AGIZA collects from each store and delivers to you.</p> : null}
              <ul className="divide-y divide-line">
                {o.sellers.map((s) => (
                  <li key={s.vendor.slug} className="flex items-center gap-3 py-2.5">
                    <StoreAvatar seller={s.vendor} size={32} />
                    <Link href={storeHref(s.vendor)} className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink hover:text-primary">
                      {s.vendor.name}
                    </Link>
                    <span className="text-[13px] text-muted">{s.item_count} item{s.item_count === 1 ? "" : "s"}</span>
                    <Badge tone={s.status === "cancelled" ? "danger" : s.status === "delivered" ? "success" : "info"}>{s.status_display}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {o.items.length ? (
            <Card>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">Items</h2>
                {o.can_return ? (
                  <Link href={`/account/orders/${o.reference}/return`} className="text-[14px] font-semibold text-primary hover:underline">
                    Return items
                  </Link>
                ) : null}
              </div>
              <ul className="divide-y divide-line">
                {o.items.map((i) => (
                  <li key={`${i.sku}-${i.product_id}`} className="flex gap-3 py-3">
                    <Link href={productHref({ id: i.product_id, name: i.name })} className="relative size-14 shrink-0 overflow-hidden rounded-md bg-tile">
                      <ProductImage src={i.image} alt="" sizes="56px" iconClass="size-5" />
                    </Link>
                    <span className={cn("min-w-0 flex-1", i.cancelled && "opacity-60")}>
                      <span className={cn("line-clamp-1 text-[15px] text-ink", i.cancelled && "line-through")}>{i.name}</span>
                      {i.cancelled ? <span className="text-[12px] font-medium text-danger">Not supplied — removed from your order</span> : null}
                      <span className="block text-[13px] text-muted">
                        {i.variant_name ? `${i.variant_name} · ` : ""}
                        {i.quantity} × {money(i.unit_price)}
                        {multiSeller && i.vendor ? ` · ${i.vendor.name}` : ""}
                      </span>
                    </span>
                    <span className="font-medium text-ink tabular-nums">{money(i.line_total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="mb-2 text-lg font-semibold text-ink">Payment</h2>
            {o.amounts ? (
              <>
                <Row label="Subtotal" value={money(o.amounts.subtotal)} />
                <Row label="Delivery" value={Number(o.amounts.shipping_fee) === 0 ? "Free" : money(o.amounts.shipping_fee)} />
                <div className="my-1 border-t border-line" />
              </>
            ) : null}
            {o.adjustments?.map((a, i) => (
              <p key={i} className="py-1 text-[13px] text-muted">
                {a.reason}: <span className="font-medium text-ink">{money(a.amount)}</span>
              </p>
            ))}
            <Row label="Total" value={money(o.payment.total, o.currency)} strong />
            <Row label="Paid" value={money(o.payment.paid, o.currency)} />
            {o.payment.due && Number(o.payment.due) > 0 ? <Row label="Due" value={money(o.payment.due, o.currency)} strong /> : null}
            {o.can_pay ? (
              <Button className="mt-3 w-full" loading={pay.isPending} onClick={() => pay.mutate()}>
                Pay with mobile money
              </Button>
            ) : null}
            {o.payment_preference === "pay_later" && o.payment.status !== "fully_paid" ? (
              <p className="mt-2 text-[13px] text-muted">Pay AGIZA by cash on delivery, bank transfer or Lipa number. We confirm your payment here.</p>
            ) : null}
            {o.payment.status !== "fully_paid" && o.payment_preference === "mobile_money" ? (
              <Button variant="ghost" size="sm" className="mt-2 w-full" loading={check.isPending} onClick={() => check.mutate()}>
                I&apos;ve paid — check again
              </Button>
            ) : null}
          </Card>
          {o.shipping ? (
            <Card>
              <h2 className="mb-2 text-lg font-semibold text-ink">Delivery</h2>
              <p className="flex gap-2 text-[14px] text-ink">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden /> {o.shipping.address}
              </p>
              {o.shipping.method ? (
                <p className="mt-2 text-[14px] text-muted">
                  {o.shipping.method}
                  {o.shipping.estimated_delivery ? ` · ${o.shipping.estimated_delivery}` : ""}
                </p>
              ) : null}
              {o.notes ? <p className="mt-2 text-[13px] text-muted">Notes: {o.notes}</p> : null}
            </Card>
          ) : null}
          {o.returns?.length ? (
            <Card>
              <h2 className="mb-2 text-lg font-semibold text-ink">Returns</h2>
              <ul className="space-y-1.5">
                {o.returns.map((r) => (
                  <li key={r.reference}>
                    <Link href={`/account/returns/${r.reference}`} className="flex items-center justify-between gap-2 text-[14px] hover:text-primary">
                      <span className="font-medium">{r.reference}</span>
                      <span className="text-muted">{r.status_display}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {o.can_cancel ? (
            <Card>
              {cancelling ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    cancel.mutate();
                  }}
                >
                  <Field label="Why are you cancelling?" htmlFor="reason">
                    <Textarea id="reason" required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                  {cancel.isError ? <Notice tone="danger">{errorMessage(cancel.error)}</Notice> : null}
                  <div className="flex gap-2">
                    <Button type="submit" variant="danger" loading={cancel.isPending}>
                      Cancel order
                    </Button>
                    <Button variant="secondary" onClick={() => setCancelling(false)}>
                      Keep order
                    </Button>
                  </div>
                </form>
              ) : (
                <Button variant="danger" className="w-full" onClick={() => setCancelling(true)}>
                  Cancel this order
                </Button>
              )}
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
