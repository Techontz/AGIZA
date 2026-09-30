"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { requestApi } from "@/lib/api/endpoints";
import { date, money } from "@/lib/format";

export default function RequestsPage() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["requests"], queryFn: requestApi.list });
  const reply = useMutation({
    mutationFn: ({ id, accept }: { id: number; accept: boolean }) => (accept ? requestApi.accept(id) : requestApi.decline(id)),
    onSuccess: (q) => {
      client.invalidateQueries({ queryKey: ["requests"] });
      toast.success(q.order ? `Accepted — order ${q.order} created` : `Request ${q.status_display.toLowerCase()}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-medium text-ink">Buy for me / Deliver for me</h1>
        <div className="flex gap-2">
          <ButtonLink href="/buy-for-me" size="sm">
            New Buy for me
          </ButtonLink>
          <ButtonLink href="/deliver-for-me" size="sm" variant="secondary">
            New Deliver for me
          </ButtonLink>
        </div>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-32" />
      ) : !list.data?.results.length ? (
        <EmptyState icon={Globe} title="No requests yet" text="Ask AGIZA to buy something abroad for you, or to bring in goods you've already bought." />
      ) : (
        <ul className="space-y-3">
          {list.data.results.map((q) => (
            <li key={q.id} className="rounded-lg bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {q.reference} · {q.service_type}
                </p>
                <Badge tone={q.status === "waiting_reply" ? "warning" : q.status === "approved" ? "success" : q.status === "declined" || q.status === "cancelled" ? "danger" : "info"}>
                  {q.status_display}
                </Badge>
              </div>
              <p className="mt-1 text-[14px] text-text">{q.description}</p>
              <p className="mt-1 text-[13px] text-muted">
                {q.origin} → {q.destination} · requested {date(q.requested_at)}
              </p>
              {q.quoted_amount ? (
                <div className="mt-3 rounded-md bg-canvas p-3 text-[14px]">
                  <p>
                    Quotation: <span className="font-semibold text-ink">{money(q.quoted_amount, q.currency)}</span>
                    {q.estimated_delivery ? ` · delivery ${q.estimated_delivery}` : ""}
                  </p>
                  {q.response_notes ? <p className="mt-1 text-muted">{q.response_notes}</p> : null}
                </div>
              ) : null}
              {q.can_reply ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" loading={reply.isPending && reply.variables?.id === q.id && reply.variables.accept} onClick={() => reply.mutate({ id: q.id, accept: true })}>
                    Accept quotation
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => reply.mutate({ id: q.id, accept: false })}>
                    Decline
                  </Button>
                </div>
              ) : null}
              {q.order ? (
                <Link href={`/account/orders/${q.order}`} className="mt-2 inline-block text-[14px] font-semibold text-primary hover:underline">
                  View order {q.order}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
