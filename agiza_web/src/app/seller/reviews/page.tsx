"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, MessageSquareReply, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Stars } from "@/components/product/stars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Card, EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerExtraApi } from "@/lib/api/endpoints";
import type { SellerReview } from "@/lib/api/types";
import { date } from "@/lib/format";

const KEY = ["seller", "reviews"];

export default function SellerReviews() {
  const reviews = useQuery({ queryKey: KEY, queryFn: sellerExtraApi.reviews });
  const summary = reviews.data?.summary;
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Reviews</h1>
      <p className="-mt-2 text-muted">Reviews from customers who received your products. Reply publicly, or ask AGIZA to check a review that breaks the rules.</p>
      {summary?.rating_count ? (
        <Card className="flex items-center gap-4">
          <p className="text-[36px] leading-none font-bold text-ink">{summary.rating}</p>
          <div>
            <Stars value={summary.rating} size={18} />
            <p className="mt-1 text-[13px] text-muted">
              Store rating from {summary.rating_count} review{summary.rating_count === 1 ? "" : "s"}
            </p>
          </div>
        </Card>
      ) : null}
      {reviews.isLoading ? (
        <Skeleton className="h-64" />
      ) : reviews.isError || !reviews.data ? (
        <Notice tone="danger">{errorMessage(reviews.error)}</Notice>
      ) : reviews.data.results.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {reviews.data.results.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={Star} title="No reviews yet" text="Customers can review a product after it has been delivered to them." />
      )}
    </>
  );
}

function ReviewRow({ review: r }: { review: SellerReview }) {
  const client = useQueryClient();
  const [mode, setMode] = useState<"reply" | "flag" | null>(null);
  const [text, setText] = useState(r.vendor_reply ?? "");
  const act = useMutation({
    mutationFn: () => (mode === "flag" ? sellerExtraApi.flag(r.id, text) : sellerExtraApi.reply(r.id, text)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: KEY });
      toast.success(mode === "flag" ? "Sent to AGIZA for review" : "Reply published");
      setMode(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={r.rating} />
        {r.title ? <span className="font-semibold text-ink">{r.title}</span> : null}
        {r.status !== "published" ? <Badge tone={r.status === "flagged" ? "warning" : "info"}>{r.status === "flagged" ? "Flagged" : "Awaiting approval"}</Badge> : null}
      </div>
      {r.body ? <p className="mt-1.5 text-[14px] whitespace-pre-line text-text">{r.body}</p> : null}
      <p className="mt-1 text-[12px] text-muted">
        {r.author || "Customer"} on{" "}
        <Link href={`/product/${r.product_id}`} className="font-medium text-primary hover:underline">
          {r.product_name}
        </Link>{" "}
        · {date(r.created_at)}
      </p>
      {r.vendor_reply && mode !== "reply" ? (
        <div className="mt-2 rounded-md bg-canvas p-3 text-[13px]">
          <p className="font-semibold text-ink">Your reply</p>
          <p className="mt-0.5 text-text">{r.vendor_reply}</p>
        </div>
      ) : null}
      {r.flag_reason ? <p className="mt-2 text-[13px] text-warning">You flagged this: {r.flag_reason}</p> : null}
      {mode ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate();
          }}
        >
          <Field label={mode === "flag" ? "Why should AGIZA check this review?" : "Public reply"} htmlFor={`rv-${r.id}`}>
            <Textarea id={`rv-${r.id}`} required maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={act.isPending} disabled={text.trim().length < (mode === "flag" ? 5 : 2)}>
              {mode === "flag" ? "Flag review" : "Publish reply"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<MessageSquareReply className="size-4" />}
            onClick={() => {
              setText(r.vendor_reply ?? "");
              setMode("reply");
            }}
          >
            {r.vendor_reply ? "Edit reply" : "Reply"}
          </Button>
          {!r.flag_reason ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<Flag className="size-4" />}
              onClick={() => {
                setText("");
                setMode("flag");
              }}
            >
              Flag
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}
