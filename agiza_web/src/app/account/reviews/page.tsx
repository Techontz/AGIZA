"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { ProductImage } from "@/components/product/product-image";
import { Stars } from "@/components/product/stars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { reviewApi } from "@/lib/api/endpoints";
import { date, productHref } from "@/lib/format";

const STATUS: Record<string, string> = { pending: "Waiting for approval", hidden: "Hidden by AGIZA", flagged: "Under review" };

export default function MyReviewsPage() {
  const client = useQueryClient();
  const data = useQuery({ queryKey: ["my-reviews"], queryFn: reviewApi.mine });
  const remove = useMutation({
    mutationFn: reviewApi.remove,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["my-reviews"] });
      toast.success("Review deleted");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (data.isLoading) return <Skeleton className="h-64" />;
  if (data.isError || !data.data) return <Notice tone="danger">{errorMessage(data.error)}</Notice>;
  const { reviews, to_review } = data.data;
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-medium text-ink">Reviews</h1>
      {to_review.length ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-ink">Waiting for your review</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {to_review.map((p) => (
              <li key={p.product_id}>
                <Link href={`${productHref({ id: p.product_id, name: p.name })}#tab-reviews`} className="flex items-center gap-3 rounded-md border border-line p-3 hover:border-brand">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-tile">
                    <ProductImage src={p.image} alt="" sizes="48px" iconClass="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-[14px] font-medium text-ink">{p.name}</span>
                    <span className="text-[12px] text-muted">Order {p.order}</span>
                  </span>
                  <Star className="size-5 text-amber" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {reviews.length ? (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={productHref({ id: r.product_id ?? 0, name: r.product_name })} className="font-semibold text-ink hover:text-primary">
                  {r.product_name}
                </Link>
                {r.status && STATUS[r.status] ? <Badge tone="warning">{STATUS[r.status]}</Badge> : null}
              </div>
              <Stars value={r.rating} className="mt-1" />
              {r.title ? <p className="mt-1 font-medium text-ink">{r.title}</p> : null}
              {r.body ? <p className="mt-0.5 text-[14px] text-text">{r.body}</p> : null}
              {r.vendor_reply ? <p className="mt-2 rounded-md bg-canvas p-2.5 text-[13px]"><span className="font-semibold">Seller:</span> {r.vendor_reply}</p> : null}
              <div className="mt-2 flex items-center justify-between text-[12px] text-muted">
                <span>{date(r.created_at)}</span>
                <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" loading={remove.isPending && remove.variables === r.id} onClick={() => remove.mutate(r.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : !to_review.length ? (
        <EmptyState icon={Star} title="No reviews yet" text="After an order is delivered you can review what you bought." />
      ) : null}
    </div>
  );
}
