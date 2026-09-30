"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { notificationApi } from "@/lib/api/endpoints";
import { cn } from "@/lib/cn";
import { dateTime } from "@/lib/format";
import { INBOX_KEY, notificationHref } from "@/lib/notifications";

export default function NotificationsPage() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: INBOX_KEY, queryFn: () => notificationApi.list() });
  const readAll = useMutation({
    mutationFn: () => notificationApi.read(),
    onSuccess: () => client.invalidateQueries({ queryKey: INBOX_KEY }),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Notifications</h1>
        {list.data?.unread ? (
          <Button variant="secondary" size="sm" loading={readAll.isPending} onClick={() => readAll.mutate()}>
            Mark all as read
          </Button>
        ) : null}
      </div>
      {list.isLoading ? (
        <Skeleton className="h-64" />
      ) : list.isError ? (
        <Notice tone="danger">{errorMessage(list.error)}</Notice>
      ) : !list.data?.results.length ? (
        <EmptyState icon={Bell} title="No notifications yet" text="Order, delivery, return and refund updates appear here." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg bg-surface shadow-card">
          {list.data.results.map((n) => {
            const href = notificationHref(n);
            const body = (
              <span className="flex gap-3 p-4">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[15px] text-ink", !n.read && "font-semibold")}>{n.title}</span>
                  {n.body ? <span className="block text-[14px] text-muted">{n.body}</span> : null}
                  <span className="text-[12px] text-subtle">{dateTime(n.created_at)}</span>
                </span>
              </span>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} className="block hover:bg-canvas" onClick={() => !n.read && notificationApi.read([n.id]).then(() => client.invalidateQueries({ queryKey: INBOX_KEY }))}>
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
