"use client";

import { AlertTriangle, Check, CheckCheck, CheckCircle, Clock, CloudOff, Edit3, FileText, MessageSquare, StickyNote } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { ErrorState } from "@/components/ui/states";
import type { ChatMessage, Quotation } from "@/lib/api/services/chat";
import { cn } from "@/lib/cn";
import { formatDate, formatTSh } from "@/lib/format";

import { clockTime, quoteHref, shortStamp } from "./config";

const QUOTE_VALID_DAYS = 7; // apps.chat.services.QUOTE_EXPIRES_AFTER

function DeliveryIndicator({ message, dark }: { message: ChatMessage; dark?: boolean }) {
  const s = message.delivery_status;
  if (message.sender !== "agent" || !s) return null;
  if (s === "stored") {
    const text = `Saved, not delivered — ${message.delivery_error || "channel not connected"}`;
    return (
      <span className={cn("inline-flex items-center gap-1 ml-1", dark ? "text-amber-400" : "text-amber-600")} title={text}>
        <CloudOff className="size-3" aria-hidden />
        <span className="sr-only">{text}</span>
        <span aria-hidden>Not delivered</span>
      </span>
    );
  }
  if (s === "failed") {
    const text = `Delivery failed — ${message.delivery_error || "the channel rejected the message"}`;
    return (
      <span className={cn("inline-flex items-center gap-1 ml-1", dark ? "text-red-400" : "text-red-600")} title={text}>
        <AlertTriangle className="size-3" aria-hidden />
        <span className="sr-only">{text}</span>
        <span aria-hidden>Failed</span>
      </span>
    );
  }
  const Icon = s === "sent" ? Check : CheckCheck;
  const label = s === "sent" ? "Sent" : s === "delivered" ? "Delivered" : "Read";
  return (
    <span className={cn("inline-flex items-center ml-1", s === "read" && (dark ? "text-sky-300" : "text-sky-600"))} title={label}>
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function QuotationCard({
  message,
  quotation,
  canAccept,
  accepting,
  onAccept,
}: {
  message: ChatMessage;
  quotation: Quotation;
  canAccept: boolean;
  accepting: boolean;
  onAccept: (q: Quotation) => void;
}) {
  const validUntil = new Date(new Date(message.created_at).getTime() + QUOTE_VALID_DAYS * 86_400_000);
  const waiting = quotation.status === "waiting_reply";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="size-5 text-blue-600" />
            <h3 className="text-slate-900">Quotation</h3>
          </div>
          <p className="text-sm text-slate-500">
            Quote ID: <span className="font-mono text-slate-700">{quotation.reference}</span>
          </p>
        </div>
        <span
          className={cn(
            "text-xs px-2.5 py-1 rounded-md border",
            waiting ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-600 border-slate-200",
          )}
        >
          {quotation.status_display}
        </span>
      </div>

      <div className="mb-4 pb-4 border-b border-slate-100">
        <p className="text-slate-900 mb-3 whitespace-pre-line">{quotation.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Service:</span>
            <span className="text-slate-900">{quotation.service_type}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Est. Delivery:</span>
            <span className="text-slate-900">{quotation.estimated_delivery ? formatDate(quotation.estimated_delivery) : "—"}</span>
          </div>
        </div>
        {quotation.notes && <p className="text-sm text-slate-600 mt-3 whitespace-pre-line">{quotation.notes}</p>}
      </div>

      <div className="bg-slate-50 rounded-lg p-4 mt-4">
        <div className="flex justify-between items-center">
          <span className="text-slate-900">Total Cost</span>
          <span className="text-slate-900 font-mono">{formatTSh(quotation.amount)}</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Valid until: {validUntil.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {waiting && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
          {canAccept && (
            <button
              type="button"
              onClick={() => onAccept(quotation)}
              disabled={accepting}
              title="Record that the client accepted this quotation"
              className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm transition-all inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <CheckCircle className="size-4" />
              {accepting ? "Recording…" : "Accept Quote"}
            </button>
          )}
          <Link
            href={quoteHref(quotation.reference, quotation.status)}
            title="Change the quotation in Intake & Quotes"
            className="flex-1 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm transition-all inline-flex items-center justify-center gap-1.5"
          >
            <Edit3 className="size-4" />
            Request Changes
          </Link>
        </div>
      )}

      <div className="flex items-center gap-1 mt-4 text-xs text-slate-400">
        <Clock className="size-3" />
        <span>{shortStamp(message.created_at)}</span>
        {message.author && <span>· {message.author.full_name}</span>}
        <DeliveryIndicator message={message} />
      </div>
    </div>
  );
}

export function MessageThread({
  messages,
  loading,
  error,
  onRetry,
  canAcceptQuote,
  acceptingQuoteId,
  onAcceptQuote,
}: {
  messages: ChatMessage[] | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  canAcceptQuote: boolean;
  acceptingQuoteId: number | null;
  onAcceptQuote: (q: Quotation) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = messages?.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    const el = scroller.current;
    if (el && lastId !== null) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <div ref={scroller} className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50" aria-live="polite" aria-busy={loading || undefined}>
      {error && !messages ? (
        <ErrorState bare message={error} onRetry={onRetry} />
      ) : loading ? (
        <div className="space-y-4 max-w-4xl mx-auto">
          {[48, 64, 40, 56].map((w, i) => (
            <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
              <div className="h-14 rounded-xl bg-slate-200 animate-pulse" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      ) : !messages || messages.length === 0 ? (
        <div className="h-full flex items-center justify-center text-center">
          <div>
            <MessageSquare className="size-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-600">No messages yet. Say hello below.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-4 max-w-4xl mx-auto">
          {messages.map((m) => (
            <li key={m.id}>
              {m.sender === "system" ? (
                <div className="flex justify-center my-4">
                  <div className="bg-slate-200 text-slate-700 px-4 py-2 rounded-full text-xs inline-flex items-center gap-2" title={shortStamp(m.created_at)}>
                    <CheckCircle className="size-3.5 text-emerald-600" />
                    <span>{m.body}</span>
                  </div>
                </div>
              ) : m.sender === "internal" ? (
                <div className="flex justify-start my-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-w-lg">
                    <div className="flex items-center gap-2 mb-1.5">
                      <StickyNote className="size-3.5 text-amber-600" />
                      <span className="text-xs text-amber-700">Internal Note</span>
                      <span className="text-xs text-amber-600">• Not visible to client</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed mb-2 whitespace-pre-line break-words">{m.body}</p>
                    <div className="flex items-center gap-2 text-xs text-amber-600">
                      <span>{m.author?.full_name ?? "Staff"}</span>
                      <span>•</span>
                      <Clock className="size-3" />
                      <span>{shortStamp(m.created_at)}</span>
                    </div>
                  </div>
                </div>
              ) : m.quotation ? (
                <QuotationCard
                  message={m}
                  quotation={m.quotation}
                  canAccept={canAcceptQuote}
                  accepting={acceptingQuoteId === m.quotation.id}
                  onAccept={onAcceptQuote}
                />
              ) : (
                <div className={cn("flex", m.sender === "agent" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] sm:max-w-lg rounded-xl px-4 py-3 shadow-sm",
                      m.sender === "agent" ? "bg-slate-900 text-white" : "bg-white text-slate-900 border border-slate-200",
                      m.delivery_status === "failed" && "ring-1 ring-red-400",
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-line break-words">{m.body}</p>
                    <div className={cn("flex items-center gap-1 mt-2 text-xs flex-wrap", m.sender === "agent" ? "text-slate-400" : "text-slate-500")}>
                      <Clock className="size-3" />
                      <span title={new Date(m.created_at).toLocaleString("en-US")}>{shortStamp(m.created_at) || clockTime(m.created_at)}</span>
                      {m.sender === "agent" && m.author && <span>· {m.author.full_name}</span>}
                      <DeliveryIndicator message={m} dark />
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
