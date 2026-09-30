"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Card, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerExtraApi } from "@/lib/api/endpoints";
import { dateTime, money } from "@/lib/format";

import { refundTone } from "../../../account/returns/tones";

const REFUND: Record<string, string> = {
  not_decided: "Not decided yet",
  pending: "Approved, refund pending",
  refunded: "Refunded to the customer",
  none: "No refund",
};

export default function SellerReturn() {
  const { reference } = useParams<{ reference: string }>();
  const client = useQueryClient();
  const key = ["seller", "return", reference];
  const ret = useQuery({ queryKey: key, queryFn: () => sellerExtraApi.return(reference) });
  const [message, setMessage] = useState("");
  const respond = useMutation({
    mutationFn: () => sellerExtraApi.respond(reference, message),
    onSuccess: (r) => {
      client.setQueryData(key, r);
      setMessage("");
      toast.success("Sent to AGIZA");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (ret.isLoading) return <Skeleton className="h-96" />;
  if (ret.isError || !ret.data) return <Notice tone="danger">{errorMessage(ret.error)}</Notice>;
  const r = ret.data;
  return (
    <>
      <Link href="/seller/returns" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Returns
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Return {r.reference}</h1>
          <p className="text-[14px] text-muted">
            Order {r.order_reference} · {dateTime(r.created_at)}
          </p>
        </div>
        <Badge tone={refundTone(r)} className="px-3 py-1 text-[13px]">
          {r.status_display}
        </Badge>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-ink">Your items in this return</h2>
          <ul className="divide-y divide-line">
            {r.items.map((i, n) => (
              <li key={n} className="flex justify-between gap-3 py-2.5">
                <span className="font-medium text-ink">
                  {i.quantity} × {i.name}
                  {i.variant_name ? <span className="block text-[13px] font-normal text-muted">{i.variant_name}</span> : null}
                </span>
                <span className="text-ink tabular-nums">{money(i.amount)}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-[15px] font-semibold text-ink">Customer&apos;s reason</h3>
          <p className="text-[14px] text-muted">{r.reason}</p>
          {r.explanation ? <p className="mt-1 text-[14px] whitespace-pre-line text-text">{r.explanation}</p> : null}
          {r.evidence?.length ? (
            <>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">Photos</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.evidence.map((src, n) => (
                  <li key={src}>
                    <a href={src} target="_blank" rel="noreferrer" className="block size-24 overflow-hidden rounded-md ring-1 ring-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private image through the signed-in proxy */}
                      <img src={src} alt={`Photo ${n + 1} from the customer`} className="size-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-ink">Refund</h2>
          <Row label="Status" value={REFUND[r.refund_status] ?? r.refund_status} />
          <p className="mt-2 text-[13px] text-muted">
            AGIZA decides refunds. If a refund is made after you were paid for these items, it is deducted from your next payout and shown in Earnings.
          </p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 text-lg font-semibold text-ink">Your response</h2>
        {r.responses?.length ? (
          <ul className="mb-3 space-y-2">
            {r.responses.map((m, n) => (
              <li key={n} className="rounded-md bg-canvas p-3 text-[14px]">
                <p className="whitespace-pre-line text-text">{m.message}</p>
                <p className="mt-1 text-[12px] text-muted">{dateTime(m.at)}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {r.can_respond ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              respond.mutate();
            }}
          >
            <Field label="Message to AGIZA" htmlFor="ret-msg">
              <Textarea
                id="ret-msg"
                required
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. the item was tested before dispatch, serial number…"
              />
            </Field>
            <Button type="submit" loading={respond.isPending} disabled={message.trim().length < 2}>
              Send
            </Button>
          </form>
        ) : (
          <p className="text-[14px] text-muted">This return is closed.</p>
        )}
      </Card>
    </>
  );
}
