"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";

import { ProductImage } from "@/components/product/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { returnApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/cn";
import { dateTime, money } from "@/lib/format";

import { refundTone } from "../tones";

const REFUND: Record<string, string> = {
  not_decided: "Not decided yet",
  pending: "Approved — AGIZA is sending your refund",
  refunded: "Refunded",
  none: "No refund",
};

export default function ReturnPage() {
  const { reference } = useParams<{ reference: string }>();
  const created = useSearchParams().get("created");
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["returns", reference];
  const ret = useQuery({ queryKey: key, queryFn: () => returnApi.get(reference) });
  const upload = useMutation({
    mutationFn: (file: File) => returnApi.addEvidence(reference, file),
    onSuccess: (r) => {
      client.setQueryData(key, r);
      toast.success("Photo added");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (ret.isLoading) return <Skeleton className="h-96" />;
  if (ret.isError || !ret.data) return <Notice tone="danger">{errorMessage(ret.error)}</Notice>;
  const r = ret.data;
  return (
    <div className="space-y-4">
      <Link href="/account/returns" className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Returns
      </Link>
      {created ? (
        <Notice tone="success">
          <span className="flex items-center gap-2 font-medium">
            <Check className="size-4" aria-hidden /> Return requested. AGIZA will review it and tell you what happens next.
          </span>
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-medium text-ink">Return {r.reference}</h1>
          <p className="text-[14px] text-muted">
            Order{" "}
            <Link href={`/account/orders/${r.order}`} className="font-medium text-primary hover:underline">
              {r.order}
            </Link>{" "}
            · {r.reason}
          </p>
        </div>
        <Badge tone={refundTone(r)} className="px-3 py-1 text-[13px]">
          {r.status_display}
        </Badge>
      </div>
      {r.message ? (
        <Notice tone="info">
          <span className="font-semibold">Message from AGIZA:</span> {r.message}
        </Notice>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-lg font-semibold text-ink">Items</h2>
            <ul className="divide-y divide-line">
              {r.lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-tile">
                    <ProductImage src={l.image} alt="" sizes="48px" iconClass="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] text-ink">
                    {l.quantity} × {l.name}
                    {l.variant_name ? <span className="text-muted"> · {l.variant_name}</span> : null}
                  </span>
                  <span className="font-medium text-ink tabular-nums">{money(l.amount)}</span>
                </li>
              ))}
            </ul>
            {r.explanation ? <p className="mt-3 rounded-md bg-canvas p-3 text-[14px] text-text">“{r.explanation}”</p> : null}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Photos</h2>
              {r.can_add_evidence ? (
                <>
                  <Button variant="secondary" size="sm" icon={<Camera className="size-4" />} loading={upload.isPending} onClick={() => input.current?.click()}>
                    Add photo
                  </Button>
                  <input
                    ref={input}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload.mutate(f);
                      e.target.value = "";
                    }}
                  />
                </>
              ) : null}
            </div>
            {r.evidence.length ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {r.evidence.map((src) => (
                  <li key={src} className="relative aspect-square overflow-hidden rounded-md bg-tile">
                    <Image src={src} alt="Photo you sent" fill unoptimized className="object-cover" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">{r.can_add_evidence ? "Photos of the problem help AGIZA decide faster." : "No photos."}</p>
            )}
          </Card>
        </div>
        <aside className="space-y-4">
          <Card>
            <h2 className="mb-2 text-lg font-semibold text-ink">Refund</h2>
            <Row label="Items' value" value={money(r.value)} />
            {r.refund_amount ? <Row label="Refund" value={money(r.refund_amount)} strong /> : null}
            <p className="mt-2 text-[13px] text-muted">{REFUND[r.refund_status]}</p>
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-semibold text-ink">Progress</h2>
            <ol className="space-y-2.5">
              {r.history.map((h, i) => (
                <li key={i} className="flex gap-2.5 text-[14px]">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", i === r.history.length - 1 ? "bg-brand" : "bg-line-strong")} />
                  <span>
                    <span className="block text-ink">{h.status}</span>
                    <span className="text-[12px] text-muted">{dateTime(h.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}
