"use client";

import { Bell, Clock, MessageSquare, MessageSquarePlus, Search } from "lucide-react";

import { ErrorState } from "@/components/ui/states";
import type { ChatChannel, ChatStats, Conversation } from "@/lib/api/services/chat";
import { cn } from "@/lib/cn";

import { CHANNELS, CLIENT_VALUE, LIFECYCLE, URGENCY, displayName, initial, isDue, shortStamp, urgencyOf } from "./config";

export const VIEW_OPTIONS = [
  ["open", "All open"],
  ["mine", "Mine"],
  ["unassigned", "Unassigned"],
  ["waiting", "Waiting for team"],
  ["urgent", "Urgent"],
  ["follow_up", "Follow-up due"],
  ["archived", "Archived"],
] as const;

const ABOUT_FILTERS: [string, string][] = [
  ["all", "All chats"],
  ["quote", "Quotations"],
  ["order", "Orders"],
  ["return", "Returns"],
  ["general", "General"],
];

function viewCount(view: string, stats: ChatStats | undefined): number | undefined {
  if (!stats) return undefined;
  return { open: stats.open, mine: stats.mine, unassigned: stats.unassigned, waiting: stats.waiting_team }[view];
}

const CHANNEL_FILTERS: ("all" | ChatChannel)[] = ["all", "whatsapp", "facebook", "tiktok"];

export function ConversationList({
  rows,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  search,
  onSearch,
  channel,
  onChannel,
  view,
  onView,
  about,
  onAbout,
  stats,
  hasMore,
  loadingMore,
  onLoadMore,
  onNew,
  canEdit,
  className,
}: {
  rows: Conversation[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  search: string;
  onSearch: (v: string) => void;
  channel: string;
  onChannel: (v: string) => void;
  view: string;
  onView: (v: string) => void;
  about: string;
  onAbout: (v: string) => void;
  stats: ChatStats | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onNew: () => void;
  canEdit: boolean;
  className?: string;
}) {
  const filtered = search.trim() !== "" || channel !== "all" || view !== "open" || about !== "all";

  return (
    <div className={cn("bg-white border-r border-slate-200 flex flex-col min-h-0", className)}>
      {/* Search & Filters */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search conversations..."
              aria-label="Search conversations"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50"
            />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onNew}
              title="New conversation"
              aria-label="New conversation"
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
            >
              <MessageSquarePlus className="size-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="chat-view" className="text-xs text-slate-500 flex-shrink-0">
            Show
          </label>
          <select
            id="chat-view"
            value={view}
            onChange={(e) => onView(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {VIEW_OPTIONS.map(([value, label]) => {
              const n = viewCount(value, stats);
              return (
                <option key={value} value={value}>
                  {label}
                  {n !== undefined ? ` (${n})` : ""}
                </option>
              );
            })}
          </select>
        </div>

        {/* What the chat is about: a quotation, an order (an approved quotation's chat moves to its order) or a return. */}
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter by what the chat is about">
          {ABOUT_FILTERS.map(([value, label]) => {
            const active = about === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onAbout(value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border",
                  active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Channel Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-2" role="group" aria-label="Filter by channel">
          {CHANNEL_FILTERS.map((c) => {
            const active = channel === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => onChannel(c)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs transition-all whitespace-nowrap",
                  active ? (c === "all" ? "bg-slate-900 text-white" : CHANNELS[c].active) : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {c === "all" ? "All" : `${CHANNELS[c].icon} ${CHANNELS[c].label}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto" aria-busy={loading || undefined}>
        {error && rows.length === 0 ? (
          <ErrorState bare message={error} onRetry={onRetry} />
        ) : loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-3 pl-4 border-b border-slate-100 flex gap-3">
              <div className="size-10 rounded-lg bg-slate-200 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 rounded bg-slate-200 animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <MessageSquare className="size-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-900">No conversations</p>
            <p className="text-xs text-slate-500 mt-1">
              {filtered ? "Try another filter or search term." : "New WhatsApp, Facebook and TikTok messages will appear here."}
            </p>
          </div>
        ) : (
          <>
            <ul>
              {rows.map((conv) => (
                <li key={conv.id}>
                  <ConversationItem conv={conv} selected={conv.id === selectedId} onSelect={() => onSelect(conv.id)} />
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="px-3 py-1.5 text-xs rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConversationItem({ conv, selected, onSelect }: { conv: Conversation; selected: boolean; onSelect: () => void }) {
  const status = LIFECYCLE[conv.lifecycle];
  const StatusIcon = status.icon;
  const urgency = URGENCY[urgencyOf(conv)];
  const value = CLIENT_VALUE[conv.client_value];
  const name = displayName(conv);
  const channel = CHANNELS[conv.channel];
  const due = isDue(conv.follow_up_at);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        "w-full p-3 pl-0 border-b border-slate-100 hover:bg-slate-50 transition-all text-left relative",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900",
        selected && "bg-slate-100",
      )}
    >
      {/* Urgency Color Strip */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", urgency.color)} />

      <div className="flex items-start gap-3 pl-4">
        <div className="size-10 bg-gradient-to-br from-slate-700 to-slate-900 rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm">
          <span className="text-xs">{initial(name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm text-slate-900 truncate">{name}</h3>
            <span className={cn("text-xs px-1.5 py-0.5 rounded border flex-shrink-0", value.color)}>{value.label}</span>
            <span className="text-xs flex-shrink-0" title={urgency.label} aria-label={`Urgency: ${urgency.label}`}>
              {urgency.icon}
            </span>
            {conv.unread_count > 0 && (
              <span
                className="bg-slate-900 text-white text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center flex-shrink-0 ml-auto"
                aria-label={`${conv.unread_count} unread`}
              >
                {conv.unread_count}
              </span>
            )}
          </div>

          {(conv.order || conv.quote || conv.return_request) && (
            <div className="mb-1.5">
              <span className="text-xs font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                {conv.order?.reference ?? conv.quote?.reference ?? conv.return_request?.reference}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className={cn("text-xs px-2 py-0.5 rounded-md", channel.color)} title={channel.label} aria-label={channel.label}>
              {channel.icon}
            </span>
            <span className={cn("text-xs px-2 py-0.5 rounded-md inline-flex items-center gap-1", status.color)}>
              <StatusIcon className="size-3" />
              {status.label}
            </span>
            {conv.status === "archived" && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-200 text-slate-600">Archived</span>
            )}
          </div>

          <p className="text-xs text-slate-600 truncate mb-1">{conv.last_message_preview || "No messages yet"}</p>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            {conv.last_message_at && (
              <div className="flex items-center gap-1">
                <Clock className="size-3" />
                <span>{shortStamp(conv.last_message_at)}</span>
              </div>
            )}
            {conv.follow_up_at && (
              <div className={cn("flex items-center gap-1", due ? "text-amber-600" : "text-slate-500")}>
                <Bell className="size-3" />
                <span>{due ? "Follow-up due" : `Follow-up ${shortStamp(conv.follow_up_at)}`}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
