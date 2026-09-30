import type { AppNotification } from "@/lib/api/types";

export const INBOX_KEY = ["notifications"] as const;

/** Where a notification leads (its `data` names the record). */
export function notificationHref(n: AppNotification): string | null {
  const d = n.data ?? {};
  if (d.return) return `/account/returns/${d.return}`;
  if (d.order) return `/account/orders/${d.order}`;
  if (d.type === "chat_message") return "/account/support";
  if (d.type === "quotation") return "/account/requests";
  return null;
}
