"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, MessageSquareText, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/hooks/use-session";
import { ApiError, errorMessage } from "@/lib/api/client";
import { reviewApi } from "@/lib/api/endpoints";
import type { Review } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { date } from "@/lib/format";

import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/field";
import { Notice, Skeleton } from "../ui/states";
import { Stars } from "./stars";

export function ProductReviews({ productId, productName }: { productId: number; productName: string }) {
  const { signedIn } = useSession();
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const reviews = useQuery({ queryKey: ["reviews", productId, page, signedIn], queryFn: () => reviewApi.list(productId, page) });
  const data = reviews.data;

  return (
    <section className="rounded-lg bg-surface p-5 shadow-card sm:p-6" aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reviews-title" className="text-lg font-semibold text-ink">
          Customer reviews
        </h2>
        {data?.can_review && !writing ? (
          <Button variant="secondary" size="sm" icon={<Star className="size-4" />} onClick={() => setWriting(true)}>
            {data.mine ? "Edit your review" : "Write a review"}
          </Button>
        ) : null}
      </div>

      {reviews.isLoading ? (
        <Skeleton className="mt-4 h-32" />
      ) : reviews.isError || !data ? (
        <Notice tone="danger" className="mt-4">
          {errorMessage(reviews.error)}
        </Notice>
      ) : (
        <>
          {writing ? (
            <ReviewForm productId={productId} productName={productName} mine={data.mine} onDone={() => setWriting(false)} />
          ) : null}
          {data.rating_count ? (
            <div className="mt-4 grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <p className="text-[40px] leading-none font-bold text-ink">{data.rating}</p>
                <Stars value={data.rating} size={18} className="mt-2" />
                <p className="mt-1 text-[13px] text-muted">
                  {data.rating_count} review{data.rating_count === 1 ? "" : "s"}
                </p>
                <ul className="mt-4 space-y-1.5" aria-label="Rating distribution">
                  {["5", "4", "3", "2", "1"].map((star) => {
                    const n = data.distribution[star] ?? 0;
                    return (
                      <li key={star} className="flex items-center gap-2 text-[12px] text-muted">
                        <span className="w-3">{star}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-tile">
                          <span className="block h-full rounded-full bg-amber" style={{ width: `${(n / data.rating_count) * 100}%` }} />
                        </span>
                        <span className="w-6 text-right tabular-nums">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <ul className="divide-y divide-line">
                {data.results.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-[14px] text-muted">
              <MessageSquareText className="size-4" aria-hidden /> No reviews yet.
              {!signedIn ? (
                <span>
                  Bought it?{" "}
                  <Link href="/login" className="font-semibold text-primary hover:underline">
                    Sign in
                  </Link>{" "}
                  to review.
                </span>
              ) : null}
            </p>
          )}
          {data.total_pages > 1 ? (
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Newer
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= data.total_pages} onClick={() => setPage(page + 1)}>
                Older
              </Button>
            </div>
          ) : null}
          <p className="mt-4 text-[12px] text-muted">Only customers who received this product can review it.</p>
        </>
      )}
    </section>
  );
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <li className="py-4 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Stars value={review.rating} />
        {review.title ? <span className="font-semibold text-ink">{review.title}</span> : null}
      </div>
      {review.body ? <p className="mt-1.5 text-[14px] whitespace-pre-line text-text">{review.body}</p> : null}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
        <span>{review.author}</span>
        {review.verified_purchase ? (
          <span className="flex items-center gap-1 text-success">
            <BadgeCheck className="size-3.5" aria-hidden /> Verified purchase
          </span>
        ) : null}
        <span>{date(review.created_at)}</span>
        {review.edited_at ? <span>(edited)</span> : null}
      </p>
      {review.vendor_reply ? (
        <div className="mt-2 rounded-md bg-canvas p-3 text-[13px]">
          <p className="font-semibold text-ink">Seller&apos;s reply</p>
          <p className="mt-0.5 text-text">{review.vendor_reply}</p>
        </div>
      ) : null}
    </li>
  );
}

function ReviewForm({ productId, productName, mine, onDone }: { productId: number; productName: string; mine: Review | null; onDone: () => void }) {
  const client = useQueryClient();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState(mine?.title ?? "");
  const [body, setBody] = useState(mine?.body ?? "");
  const save = useMutation({
    mutationFn: () => reviewApi.submit(productId, { rating, title, body }),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["reviews", productId] });
      toast.success(r.status === "pending" ? "Thanks! Your review will appear once approved." : "Thanks for your review!");
      onDone();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <form
      className="mt-4 space-y-3 rounded-md border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-[14px] font-medium text-ink">Your review of {productName}</p>
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={rating === i}
            aria-label={`${i} star${i === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(i)}
            className="rounded-sm p-1"
          >
            <Star className={cn("size-7", (hover || rating) >= i ? "fill-amber text-amber" : "text-line-strong")} aria-hidden />
          </button>
        ))}
      </div>
      {err?.field("rating") ? <p className="text-[13px] text-danger">{err.field("rating")}</p> : null}
      <Field label="Title (optional)" htmlFor="rv-title">
        <Input id="rv-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="What did you think?" htmlFor="rv-body">
        <Textarea id="rv-body" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {save.isError && !err?.field("rating") ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending} disabled={!rating}>
          {mine ? "Update review" : "Post review"}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
