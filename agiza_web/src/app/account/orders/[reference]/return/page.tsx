"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Card, Notice, Skeleton } from "@/components/ui/states";
import { QuantityStepper } from "@/components/ui/stepper";
import { ApiError, errorMessage } from "@/lib/api/client";
import { returnApi } from "@/lib/api/endpoints";
import { money } from "@/lib/format";

export default function ReturnRequestPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const info = useQuery({ queryKey: ["returnable", reference], queryFn: () => returnApi.returnable(reference) });
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const create = useMutation({
    mutationFn: () =>
      returnApi.create(reference, {
        lines: Object.entries(qty).filter(([, q]) => q > 0).map(([item, quantity]) => ({ item: Number(item), quantity })),
        reason_code: reason,
        explanation,
      }),
    onSuccess: (r) => router.replace(`/account/returns/${r.reference}?created=1`),
  });
  if (info.isLoading) return <Skeleton className="h-96" />;
  if (info.isError || !info.data) return <Notice tone="danger">{errorMessage(info.error)}</Notice>;
  const d = info.data;
  const chosen = Object.values(qty).some((q) => q > 0);
  const err = create.error instanceof ApiError ? create.error : null;
  return (
    <div className="space-y-4">
      <Link href={`/account/orders/${reference}`} className="inline-flex items-center gap-1 text-[14px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Order {reference}
      </Link>
      <h1 className="text-[24px] font-medium text-ink">Return items</h1>
      {!d.can_return ? (
        <Notice tone="warning">
          {d.window_open ? "Everything from this order is already being returned." : `Items can be returned within ${d.window_days} days of delivery. This order can't be returned now — contact AGIZA support if something is wrong.`}
        </Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Card>
            <h2 className="mb-1 text-lg font-semibold text-ink">What are you returning?</h2>
            <p className="mb-3 text-[13px] text-muted">Returns are possible within {d.window_days} days of delivery.</p>
            <ul className="divide-y divide-line">
              {d.items.map((i) => (
                <li key={i.item} className="flex flex-wrap items-center gap-3 py-3">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-primary)]"
                      disabled={!i.returnable}
                      checked={(qty[i.item] ?? 0) > 0}
                      onChange={(e) => setQty({ ...qty, [i.item]: e.target.checked ? 1 : 0 })}
                    />
                    <span className="min-w-0">
                      <span className="block text-[15px] text-ink">{i.name}</span>
                      <span className="text-[13px] text-muted">
                        {i.variant_name ? `${i.variant_name} · ` : ""}
                        {money(i.unit_price)} each · {i.returnable ? `${i.returnable} can be returned` : "already being returned"}
                      </span>
                    </span>
                  </label>
                  {(qty[i.item] ?? 0) > 0 && i.returnable > 1 ? (
                    <QuantityStepper size="sm" value={qty[i.item]} max={i.returnable} onChange={(q) => setQty({ ...qty, [i.item]: q })} />
                  ) : null}
                </li>
              ))}
            </ul>
            {err?.field("lines") ? <p className="mt-2 text-[13px] text-danger">{err.field("lines")}</p> : null}
          </Card>
          <Card className="space-y-4">
            <Field label="Reason" htmlFor="reason" error={err?.field("reason_code")}>
              <Select id="reason" required value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="" disabled>
                  Choose a reason
                </option>
                {d.reasons.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tell us what happened" htmlFor="explanation" error={err?.field("explanation")} hint="You can add photos after sending the request.">
              <Textarea id="explanation" required minLength={5} maxLength={2000} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
            </Field>
            {create.isError && !err?.details ? <Notice tone="danger">{errorMessage(create.error)}</Notice> : null}
            <Button type="submit" size="lg" loading={create.isPending} disabled={!chosen || !reason}>
              Request return
            </Button>
            <p className="text-[13px] text-muted">AGIZA reviews every request. If it&apos;s approved, we arrange collection and refund you once the item is checked.</p>
          </Card>
        </form>
      )}
    </div>
  );
}
