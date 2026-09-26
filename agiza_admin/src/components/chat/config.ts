import {
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Package,
  Send,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type {
  ChatChannel,
  ClientActionState,
  ClientValue,
  Conversation,
  Lifecycle,
  OrderKind,
  ResponseStatus,
} from "@/lib/api/services/chat";

/* Visual config mirrors ChatSupport.tsx (Figma Make, slate palette). */

export const CHANNELS: Record<ChatChannel, { label: string; icon: string; color: string; active: string }> = {
  whatsapp: { label: "WhatsApp", icon: "💬", color: "bg-emerald-50 text-emerald-700 border border-emerald-200", active: "bg-emerald-600 text-white" },
  facebook: { label: "Facebook", icon: "📘", color: "bg-blue-50 text-blue-700 border border-blue-200", active: "bg-blue-600 text-white" },
  tiktok: { label: "TikTok", icon: "🎵", color: "bg-pink-50 text-pink-700 border border-pink-200", active: "bg-pink-600 text-white" },
  web: { label: "Web", icon: "🌐", color: "bg-violet-50 text-violet-700 border border-violet-200", active: "bg-violet-600 text-white" },
};

export const LIFECYCLE_STEPS: { key: Lifecycle; label: string }[] = [
  { key: "new_inquiry", label: "New Inquiry" },
  { key: "quoted", label: "Quoted" },
  { key: "awaiting_payment", label: "Awaiting Payment" },
  { key: "paid", label: "Paid" },
  { key: "shipping", label: "Shipping" },
  { key: "delivered", label: "Delivered" },
];

export const LIFECYCLE: Record<Lifecycle, { label: string; color: string; icon: LucideIcon }> = {
  new_inquiry: { label: "New Inquiry", color: "bg-slate-100 text-slate-700 border border-slate-300", icon: AlertCircle },
  quoted: { label: "Quoted", color: "bg-blue-100 text-blue-700 border border-blue-300", icon: FileText },
  awaiting_payment: { label: "Awaiting Payment", color: "bg-amber-100 text-amber-700 border border-amber-300", icon: DollarSign },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-700 border border-emerald-300", icon: CheckCircle },
  shipping: { label: "Shipping", color: "bg-indigo-100 text-indigo-700 border border-indigo-300", icon: Package },
  delivered: { label: "Delivered", color: "bg-green-100 text-green-700 border border-green-300", icon: CheckCircle },
};

export const RESPONSE_STATUS: Record<ResponseStatus, { label: string; color: string; icon: LucideIcon }> = {
  waiting_client: { label: "Waiting for Client", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
  waiting_team: { label: "Waiting for Team", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertCircle },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700 border-red-200", icon: Zap },
  new: { label: "New", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: AlertCircle },
};

export const CLIENT_ACTION: Record<ClientActionState, { label: string; color: string; icon: LucideIcon }> = {
  quote_sent: { label: "Quote Sent", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Send },
  quote_viewed: { label: "Quote Viewed", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: Eye },
  awaiting_response: { label: "Awaiting Response", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  quote_expired: { label: "Quote Expired", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
};

export const CLIENT_VALUE: Record<ClientValue, { label: string; color: string }> = {
  curious: { label: "Curious Client", color: "bg-purple-100 text-purple-700 border-purple-200" },
  customer: { label: "Customer", color: "bg-blue-100 text-blue-700 border-blue-200" },
  repeating: { label: "Repeating Customer", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  high_value: { label: "High Value Client", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

export type Urgency = "urgent" | "waiting" | "active";

export const URGENCY: Record<Urgency, { label: string; color: string; icon: string }> = {
  urgent: { label: "Urgent", color: "bg-red-500", icon: "🔴" },
  waiting: { label: "Waiting", color: "bg-amber-500", icon: "🟡" },
  active: { label: "Active", color: "bg-emerald-500", icon: "🟢" },
};

/** Urgency derived from the backend's response status (and escalation). */
export function urgencyOf(c: Conversation): Urgency {
  if (c.response_status === "urgent" || c.escalated_to) return "urgent";
  if (c.response_status === "waiting_team" || c.response_status === "new") return "waiting";
  return "active";
}

export const ESCALATION_LABEL: Record<string, string> = {
  management: "Manager",
  procurement: "Procurement",
  finance: "Finance",
  sales: "Sales",
  support: "Support",
  delivery: "Delivery",
};

const ORDER_PAGE: Record<OrderKind, string> = {
  express: "/orders/express",
  international: "/orders/international",
  equipment: "/orders/equipment-support",
  shop: "/orders/ecommerce",
};

export function orderHref(order: NonNullable<Conversation["order"]>): string {
  return `${ORDER_PAGE[order.order_type] ?? "/orders"}?open=${order.id}`;
}

/** Intake & Quotes tab that lists a quotation with this status. */
export function quoteHref(reference: string, status: string): string {
  const tab = status === "answered" ? "answered" : status === "waiting_reply" ? "waiting_reply" : "new";
  const params = new URLSearchParams({ search: reference });
  if (tab !== "new") params.set("tab", tab);
  return `/intake-quotes?${params.toString()}`;
}

export function displayName(c: Conversation): string {
  return c.customer?.full_name || c.contact_name || c.contact_handle;
}

export function initial(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

const LOCALE = "en-US";

export function clockTime(value: string): string {
  return new Date(value).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** "02:30 PM" today, "Apr 18, 02:30 PM" otherwise. */
export function shortStamp(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isToday(d)) return clockTime(value);
  return d.toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function isDue(value: string | null): boolean {
  return Boolean(value) && new Date(value as string).getTime() <= Date.now();
}
