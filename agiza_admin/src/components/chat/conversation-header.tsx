"use client";

import {
  Archive,
  ArrowLeft,
  ArrowUpCircle,
  Bell,
  BellOff,
  Check,
  FileText,
  Link2,
  LogOut,
  MoreVertical,
  Package,
  Phone,
  RotateCcw,
  Timer,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { Conversation } from "@/lib/api/services/chat";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

import {
  CHANNELS,
  CLIENT_ACTION,
  CLIENT_VALUE,
  ESCALATION_LABEL,
  LIFECYCLE,
  LIFECYCLE_STEPS,
  RESPONSE_STATUS,
  URGENCY,
  displayName,
  initial,
  isDue,
  orderHref,
  quoteHref,
  shortStamp,
  urgencyOf,
} from "./config";

const ghostBtn =
  "px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs transition-all inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60";

export interface HeaderActions {
  onBack: () => void;
  onLink: () => void;
  onLinkRecords: () => void;
  onFollowUp: () => void;
  onClearFollowUp: () => void;
  onEscalate: () => void;
  onTakeOver: () => void;
  onRelease: () => void;
  onArchive: () => void;
  onReopen: () => void;
}

export function ConversationHeader({
  conv,
  meId,
  canEdit,
  pending,
  actions,
}: {
  conv: Conversation;
  meId: number | undefined;
  canEdit: boolean;
  pending: { takeOver: boolean; release: boolean; status: boolean; followUp: boolean };
  actions: HeaderActions;
}) {
  const name = displayName(conv);
  const urgency = URGENCY[urgencyOf(conv)];
  const value = CLIENT_VALUE[conv.client_value];
  const channel = CHANNELS[conv.channel];
  const status = LIFECYCLE[conv.lifecycle];
  const StatusIcon = status.icon;
  const response = RESPONSE_STATUS[conv.response_status];
  const ResponseIcon = response.icon;
  const clientAction = conv.client_action_state ? CLIENT_ACTION[conv.client_action_state] : null;
  const phone = conv.channel === "whatsapp" || conv.channel === "web" ? conv.customer?.phone || conv.contact_handle : conv.customer?.phone;
  const isMine = Boolean(meId) && conv.active_handler?.id === meId;
  const currentIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === conv.lifecycle);
  const due = isDue(conv.follow_up_at);

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 sm:px-6 py-4 border-b border-slate-700">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          <button type="button" onClick={actions.onBack} aria-label="Back to conversations" className="lg:hidden p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="size-5" />
          </button>
          <div className="size-12 bg-white/10 backdrop-blur-sm rounded-lg hidden sm:flex items-center justify-center flex-shrink-0 relative">
            <span className="text-lg">{initial(name)}</span>
            <div className={cn("absolute -top-1 -right-1 size-3 rounded-full ring-2 ring-slate-900", urgency.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-white truncate">{name}</h2>
                <span className={cn("text-xs px-2 py-0.5 rounded border", value.color)}>{value.label}</span>
                <span className="text-xs bg-white/10 px-2 py-0.5 rounded inline-flex items-center gap-1">
                  <span aria-hidden>{urgency.icon}</span>
                  <span className="text-white">{urgency.label}</span>
                </span>
                {!conv.customer && <span className="text-xs text-slate-300 bg-white/10 px-2 py-0.5 rounded">Not linked to a client</span>}
                {conv.status === "archived" && <span className="text-xs text-slate-200 bg-white/20 px-2 py-0.5 rounded">Archived</span>}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Phone className="size-3.5" />
                  <span className="font-mono">{conv.contact_handle}</span>
                </div>
                <span className={cn("px-2 py-0.5 rounded", channel.color)}>
                  {channel.icon} {channel.label}
                </span>
                {conv.order && (
                  <Link href={orderHref(conv.order)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded" title="Open order">
                    <Package className="size-3.5" />
                    <span className="font-mono text-white">{conv.order.reference}</span>
                  </Link>
                )}
                {conv.quote && (
                  <Link href={quoteHref(conv.quote.reference, conv.quote.status)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded" title="Open quotation">
                    <FileText className="size-3.5" />
                    <span className="font-mono text-white">{conv.quote.reference}</span>
                  </Link>
                )}
                <span className={cn("px-2 py-0.5 rounded border inline-flex items-center gap-1", status.color)}>
                  <StatusIcon className="size-3.5" />
                  {status.label}
                </span>
                <span className={cn("px-2 py-0.5 rounded border inline-flex items-center gap-1", response.color)}>
                  <ResponseIcon className="size-3.5" />
                  {response.label}
                </span>
                {clientAction && (
                  <span className={cn("px-2 py-0.5 rounded border inline-flex items-center gap-1", clientAction.color)}>
                    <clientAction.icon className="size-3.5" />
                    {clientAction.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {phone ? (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title={`Call ${phone}`} aria-label={`Call ${phone}`}>
              <Phone className="size-4 text-white" />
            </a>
          ) : null}
          {canEdit && (
            <button type="button" onClick={actions.onLink} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Link to existing client" aria-label="Link to existing client">
              <Link2 className="size-4 text-white" />
            </button>
          )}
          {canEdit && <MoreMenu conv={conv} pending={pending} actions={actions} />}
        </div>
      </div>

      {/* Ownership Control */}
      <div className="bg-white/5 backdrop-blur-sm rounded-lg px-3 py-2 mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={cn("size-2 rounded-full", conv.active_handler ? "bg-emerald-400 animate-pulse" : "bg-slate-500")} />
            <span className="text-xs text-slate-300">
              Handled by: <span className="text-white">{conv.active_handler?.full_name ?? "Unassigned"}</span>
              {conv.active_handler && (
                <span className="ml-1 text-emerald-400" title={conv.handler_since ? `Since ${shortStamp(conv.handler_since)}` : undefined}>
                  (Active{conv.handler_since ? ` · ${timeAgo(conv.handler_since)}` : ""})
                </span>
              )}
            </span>
          </div>
          {conv.follow_up_at && (
            <div className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded", due ? "text-amber-200 bg-amber-500/40" : "text-amber-300 bg-amber-500/20")}>
              <Bell className="size-3" />
              <span>
                {due ? "Follow-up due" : "Follow-up"}: {shortStamp(conv.follow_up_at)}
              </span>
            </div>
          )}
          {conv.escalated_to && (
            <div className="flex items-center gap-1.5 text-xs text-red-200 bg-red-500/20 px-2 py-1 rounded">
              <ArrowUpCircle className="size-3" />
              <span>Escalated to {ESCALATION_LABEL[conv.escalated_to] ?? conv.escalated_to}</span>
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            {isMine ? (
              <button type="button" onClick={actions.onRelease} disabled={pending.release} className={ghostBtn}>
                <LogOut className="size-3" />
                {pending.release ? "Releasing…" : "Release"}
              </button>
            ) : (
              <button type="button" onClick={actions.onTakeOver} disabled={pending.takeOver} className={ghostBtn}>
                <UserCheck className="size-3" />
                {pending.takeOver ? "Taking over…" : "Take Over"}
              </button>
            )}
            <button type="button" onClick={actions.onFollowUp} className={ghostBtn}>
              <Timer className="size-3" />
              Set Follow-Up
            </button>
            <button type="button" onClick={actions.onEscalate} className={ghostBtn}>
              <ArrowUpCircle className="size-3" />
              Escalate
            </button>
          </div>
        )}
      </div>

      {/* Lifecycle Progression Bar */}
      <div className="bg-white/5 backdrop-blur-sm rounded-lg p-3 overflow-x-auto">
        <ol className="flex items-center justify-between min-w-[560px]" aria-label="Order lifecycle">
          {LIFECYCLE_STEPS.map((step, index) => {
            const isActive = index === currentIndex;
            const isCompleted = index < currentIndex;
            const isLast = index === LIFECYCLE_STEPS.length - 1;
            return (
              <li key={step.key} className="flex items-center flex-1 last:flex-none" aria-current={isActive ? "step" : undefined}>
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "size-8 rounded-full flex items-center justify-center text-xs transition-all",
                      isActive ? "bg-white text-slate-900" : isCompleted ? "bg-emerald-500 text-white" : "bg-white/10 text-slate-400",
                    )}
                  >
                    {isCompleted ? <Check className="size-4" aria-label="Completed" /> : index + 1}
                  </div>
                  <span className={cn("text-xs mt-1.5 whitespace-nowrap", isActive ? "text-white" : isCompleted ? "text-slate-300" : "text-slate-500")}>
                    {step.label}
                  </span>
                </div>
                {!isLast && <div className={cn("flex-1 h-0.5 mx-2 mb-6 transition-all", isCompleted ? "bg-emerald-500" : "bg-white/10")} />}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function MoreMenu({
  conv,
  pending,
  actions,
}: {
  conv: Conversation;
  pending: { status: boolean; followUp: boolean };
  actions: HeaderActions;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 inline-flex items-center gap-2 text-left disabled:opacity-50";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="size-4 text-white" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-20">
          <button role="menuitem" type="button" className={item} onClick={run(actions.onLinkRecords)} disabled={!conv.customer} title={conv.customer ? undefined : "Link a client first"}>
            <Package className="size-4 text-slate-500" /> Link order / quotation
          </button>
          {conv.follow_up_at && (
            <button role="menuitem" type="button" className={item} onClick={run(actions.onClearFollowUp)} disabled={pending.followUp}>
              <BellOff className="size-4 text-slate-500" /> Clear follow-up
            </button>
          )}
          {conv.status === "open" ? (
            <button role="menuitem" type="button" className={item} onClick={run(actions.onArchive)} disabled={pending.status}>
              <Archive className="size-4 text-slate-500" /> Archive conversation
            </button>
          ) : (
            <button role="menuitem" type="button" className={item} onClick={run(actions.onReopen)} disabled={pending.status}>
              <RotateCcw className="size-4 text-slate-500" /> Reopen conversation
            </button>
          )}
        </div>
      )}
    </div>
  );
}
