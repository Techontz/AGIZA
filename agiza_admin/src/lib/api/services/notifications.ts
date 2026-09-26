import { api } from "../client";
import type { Paginated } from "../types";

export type NotificationKind = "assignment" | "escalation" | "follow_up" | "approval" | "message" | "system";

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  kind_display: string;
  title: string;
  body: string;
  /** App path, e.g. "/chat?open=12" (may be empty). */
  link: string;
  read_at: string | null;
  created_at: string;
}

export const notificationsApi = {
  list: (pageSize = 10, signal?: AbortSignal) =>
    api.get<Paginated<AppNotification>>("notifications", { page_size: pageSize }, signal),
  unreadCount: (signal?: AbortSignal) => api.get<{ unread: number }>("notifications/unread-count", undefined, signal),
  markRead: (id: number) => api.post<{ unread: number }>(`notifications/${id}/read`),
  markAllRead: () => api.post<{ unread: number }>("notifications/read-all"),
};

export const notificationKeys = {
  all: ["notifications"] as const,
  unread: ["notifications", "unread"] as const,
  list: ["notifications", "list"] as const,
};
