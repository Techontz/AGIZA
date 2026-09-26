"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { errorText } from "@/lib/api/errors";
import { notificationKeys, notificationsApi, type AppNotification } from "@/lib/api/services/notifications";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

/** Top-bar bell: unread badge (polled every 30s) and a dropdown of the latest notifications. */
export function NotificationsBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const unread = useQuery({
    queryKey: notificationKeys.unread,
    queryFn: ({ signal }) => notificationsApi.unreadCount(signal),
    refetchInterval: 30_000,
  });
  const list = useQuery({
    queryKey: notificationKeys.list,
    queryFn: ({ signal }) => notificationsApi.list(10, signal),
    enabled: open,
    staleTime: 0,
  });

  // A new unread count means the list may be stale.
  const count = unread.data?.unread ?? 0;
  useEffect(() => {
    qc.invalidateQueries({ queryKey: notificationKeys.list });
  }, [count, qc]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const refresh = (unreadNow: number) => {
    qc.setQueryData(notificationKeys.unread, { unread: unreadNow });
    qc.invalidateQueries({ queryKey: notificationKeys.list });
  };

  const openItem = async (n: AppNotification) => {
    if (!n.read_at) {
      setOpeningId(n.id);
      try {
        refresh((await notificationsApi.markRead(n.id)).unread);
      } catch (err) {
        toast.error(errorText(err));
      } finally {
        setOpeningId(null);
      }
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      refresh((await notificationsApi.markAllRead()).unread);
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setMarkingAll(false);
    }
  };

  const items = list.data?.results ?? [];
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-semibold leading-5 text-center ring-2 ring-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">
              Notifications
              {count > 0 && <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{count} new</span>}
            </p>
            <button
              type="button"
              onClick={markAll}
              disabled={count === 0 || markingAll}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {markingAll ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
              Mark all as read
            </button>
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {list.isLoading ? (
              <ul aria-busy="true" aria-label="Loading notifications">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="px-4 py-3 border-b border-gray-100 last:border-0">
                    <div className="h-3.5 w-40 animate-pulse rounded bg-gray-200 mb-2" />
                    <div className="h-3 w-56 animate-pulse rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            ) : list.isError ? (
              <div className="px-4 py-8 text-center" role="alert">
                <p className="text-sm text-gray-700">Couldn&apos;t load notifications.</p>
                <button type="button" onClick={() => list.refetch()} className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800">
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="size-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600">You&apos;re all caught up</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const isUnread = !n.read_at;
                  return (
                    <li key={n.id} className="border-b border-gray-100 last:border-0">
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        disabled={openingId === n.id}
                        className={cn(
                          "w-full text-left flex gap-3 px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-70",
                          isUnread && "bg-blue-50/50",
                        )}
                      >
                        <span
                          className={cn("mt-1.5 size-2 rounded-full shrink-0", isUnread ? "bg-blue-600" : "bg-transparent")}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={cn("text-sm text-gray-900", isUnread ? "font-semibold" : "font-medium")}>
                              {n.title}
                              {isUnread && <span className="sr-only"> (unread)</span>}
                            </span>
                            <span className="text-xs text-gray-500 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                          </span>
                          {n.body && <span className="block text-xs text-gray-600 mt-0.5 line-clamp-2">{n.body}</span>}
                          <span className="block text-[11px] text-gray-400 mt-1">{n.kind_display}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
