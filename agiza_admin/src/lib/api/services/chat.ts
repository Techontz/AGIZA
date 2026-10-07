import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";

/* ------------------------------------------------------------------ types */

export type ChatChannel = "whatsapp" | "facebook" | "tiktok" | "web";
export type Lifecycle = "new_inquiry" | "quoted" | "awaiting_payment" | "paid" | "shipping" | "delivered";
export type ResponseStatus = "new" | "waiting_team" | "waiting_client" | "urgent";
export type ClientActionState = "quote_sent" | "quote_viewed" | "awaiting_response" | "quote_expired";
export type ClientValue = "curious" | "customer" | "repeating" | "high_value";
export type ChatView = "mine" | "unassigned" | "waiting" | "urgent" | "follow_up" | "archived";
export type EscalationTarget = "management" | "procurement" | "finance" | "sales" | "support" | "delivery";
export type QuoteServiceType = "international" | "express" | "equipment";
export type OrderKind = "express" | "international" | "equipment" | "shop";

export interface ChatPerson {
  id: number;
  full_name: string;
}

export interface Conversation {
  id: number;
  reference: string;
  channel: ChatChannel;
  channel_display: string;
  contact_name: string;
  contact_handle: string;
  customer: { id: number; reference: string; full_name: string; phone: string } | null;
  order: { id: number; reference: string; order_type: OrderKind } | null;
  quote: { id: number; reference: string; status: string } | null;
  /** Set when the customer opened this chat from a return in the app. */
  return_request?: { id: number; reference: string } | null;
  status: "open" | "archived";
  response_status: ResponseStatus;
  department: string;
  assigned_agent: ChatPerson | null;
  active_handler: ChatPerson | null;
  handler_since: string | null;
  escalated_to: EscalationTarget | "";
  escalated_at: string | null;
  follow_up_at: string | null;
  last_message_at: string | null;
  last_message_preview: string;
  unread_count: number;
  lifecycle: Lifecycle;
  client_action_state: ClientActionState | null;
  client_value: ClientValue;
  created_at: string;
}

export type DeliveryStatus = "" | "stored" | "sent" | "delivered" | "read" | "failed" | "received";

export interface Quotation {
  id: number;
  reference: string;
  description: string;
  amount: string | null;
  service_type: string;
  estimated_delivery: string | null;
  notes: string;
  status: string;
  status_display: string;
}

export interface ChatMessage {
  id: number;
  sender: "customer" | "agent" | "system" | "internal";
  body: string;
  author: ChatPerson | null;
  quotation: Quotation | null;
  delivery_status: DeliveryStatus;
  delivery_error: string;
  created_at: string;
}

export interface ChatStats {
  open: number;
  mine: number;
  unassigned: number;
  waiting_team: number;
  by_channel: Partial<Record<ChatChannel, number>>;
}

export interface ChatAgent {
  id: number;
  full_name: string;
  department: string;
  open_chats: number;
}

export type ChannelStatus = Partial<Record<string, boolean>>;

export interface QuickReply {
  id: number;
  text: string;
  sort_order: number;
  is_active: boolean;
}

/* ---------------------------------------------------------------- service */

const base = "chat/conversations";
const post = (id: number, path: string, body?: unknown) => api.post<Conversation>(`${base}/${id}/${path}`, body ?? {});

export const chatApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Conversation>>(base, query, signal),
  get: (id: number, signal?: AbortSignal) => api.get<Conversation>(`${base}/${id}`, undefined, signal),
  stats: () => api.get<ChatStats>(`${base}/stats`),
  agents: () => api.get<ChatAgent[]>(`${base}/agents`),
  channels: () => api.get<ChannelStatus>(`${base}/channels`),
  quickReplies: () => api.get<QuickReply[]>("chat/quick-replies"),
  messages: (id: number, signal?: AbortSignal) => api.get<ChatMessage[]>(`${base}/${id}/messages`, undefined, signal),

  send: (id: number, body: string, internal: boolean) =>
    api.post<ChatMessage>(`${base}/${id}/send`, { body, internal }),
  sendQuote: (id: number, quote: number) => api.post<ChatMessage>(`${base}/${id}/send-quote`, { quote }),
  createQuote: (
    id: number,
    data: { service_type: QuoteServiceType; description: string; origin?: string; destination?: string },
  ) => post(id, "create-quote", data),
  takeOver: (id: number) => post(id, "take-over"),
  release: (id: number) => post(id, "release"),
  assign: (id: number, agent: number) => post(id, "assign", { agent }),
  escalate: (id: number, to: EscalationTarget, note: string) => post(id, "escalate", { to, note }),
  followUp: (id: number, at: string | null) => post(id, "follow-up", { at }),
  link: (id: number, data: { customer?: number; order?: number; quote?: number }) => post(id, "link", data),
  markRead: (id: number) => post(id, "mark-read"),
  archive: (id: number) => post(id, "archive"),
  reopen: (id: number) => post(id, "reopen"),
  start: (data: { customer: number; channel: ChatChannel; body: string }) =>
    api.post<Conversation>(`${base}/start`, data),
};

export const chatKeys = {
  all: ["chat"] as const,
  lists: ["chat", "list"] as const,
  list: (query: object) => ["chat", "list", query] as const,
  stats: ["chat", "stats"] as const,
  one: (id: number) => ["chat", "one", id] as const,
  messages: (id: number) => ["chat", "messages", id] as const,
  agents: ["chat", "agents"] as const,
  channels: ["chat", "channels"] as const,
  quickReplies: ["chat", "quick-replies"] as const,
};
