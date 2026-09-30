"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Card, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi, sellerExtraApi } from "@/lib/api/endpoints";
import type { SellerOrder } from "@/lib/api/types";
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
      <IssueCard order={o} queryKey={key} />
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
                    {e.note || e.status_display}
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

const ISSUE_TYPES = [
  { value: "item_unavailable", label: "An item is unavailable" },
  { value: "stock_discrepancy", label: "Stock count was wrong" },
  { value: "damaged_item", label: "An item is damaged" },
  { value: "cannot_fulfill", label: "I can't fulfil this order" },
  { value: "other", label: "Other problem" },
];

function IssueCard({ order, queryKey }: { order: SellerOrder; queryKey: unknown[] }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const report = useMutation({
    mutationFn: () => sellerExtraApi.reportIssue(order.id, type, note),
    onSuccess: (o) => {
      client.setQueryData(queryKey, o);
      client.invalidateQueries({ queryKey: ["seller", "orders"] });
      setOpen(false);
      toast.success("Reported. AGIZA will contact the customer and decide what happens next.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const issue = order.issue;
  if (issue) {
    return (
      <Notice tone={issue.resolved_at ? "info" : "warning"}>
        <span className="font-semibold">
          {issue.resolved_at ? "Problem resolved" : "Problem reported"}: {issue.type_display}.
        </span>{" "}
        {issue.note}
        {issue.resolved_at ? ` AGIZA's decision: ${issue.resolution || "resolved"} (${dateTime(issue.resolved_at)}).` : ` Reported ${dateTime(issue.reported_at)}. AGIZA is handling it; don't ship until they confirm.`}
      </Notice>
    );
  }
  if (!order.can_report_issue) return null;
  if (!open) {
    return (
      <p className="text-[14px] text-muted">
        Can&apos;t supply something?{" "}
        <button type="button" onClick={() => setOpen(true)} className="font-semibold text-primary hover:underline">
          Report a problem with this order
        </button>
      </p>
    );
  }
  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          report.mutate();
        }}
      >
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <AlertTriangle className="size-5 text-warning" aria-hidden /> Report a problem
        </h2>
        <p className="text-[14px] text-muted">
          AGIZA will tell the customer and decide whether to cancel your part and refund them. Other sellers in the order aren&apos;t affected.
        </p>
        <Field label="What's wrong?" htmlFor="issue-type">
          <Select id="issue-type" required value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Choose…</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Details" htmlFor="issue-note">
          <Textarea id="issue-note" required minLength={5} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Which item, how many, and why" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={report.isPending} disabled={!type || note.trim().length < 5}>
            Send to AGIZA
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
