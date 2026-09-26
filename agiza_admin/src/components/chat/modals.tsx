"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, BellOff, Check, Clock, DollarSign, Package, Timer } from "lucide-react";
import { useState } from "react";

import { errorText } from "@/lib/api/errors";
import { chatApi, chatKeys, type Conversation, type EscalationTarget } from "@/lib/api/services/chat";

import { Avatar, ChatModal, InlineError, OptionButton, primaryBtn, secondaryBtn, slateInput } from "./chat-modal";
import { shortStamp } from "./config";
import { useConversationMutation } from "./use-chat-mutation";

interface ModalProps {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
}

/* ------------------------------------------------------------ follow-up */

function inHours(h: number): Date {
  return new Date(Date.now() + h * 3_600_000);
}

function tomorrowMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** yyyy-MM-ddTHH:mm in local time, for <input type="datetime-local">. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FollowUpModal({ conversation, open, onClose }: ModalProps) {
  const [custom, setCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setCustom(false);
    setCustomValue("");
    setError(null);
    onClose();
  };
  const mutation = useConversationMutation(conversation.id, (at: string | null) => chatApi.followUp(conversation.id, at), {
    success: (c) => (c.follow_up_at ? `Follow-up set for ${shortStamp(c.follow_up_at)}` : "Follow-up cleared"),
    onSuccess: close,
    onError: (e) => setError(errorText(e)),
  });
  const set = (key: string, at: Date | null) => {
    setError(null);
    setChoice(key);
    mutation.mutate(at ? at.toISOString() : null);
  };
  const pendingFor = (key: string) => mutation.isPending && choice === key;

  return (
    <ChatModal open={open} onClose={close} title="Set Follow-Up Reminder">
      <div className="space-y-2">
        {conversation.follow_up_at && (
          <p className="text-xs text-slate-600 mb-2">
            Current reminder: <span className="text-slate-900">{shortStamp(conversation.follow_up_at)}</span>
          </p>
        )}
        <OptionButton icon={Timer} label="In 1 hour" onClick={() => set("1h", inHours(1))} pending={pendingFor("1h")} disabled={mutation.isPending} />
        <OptionButton icon={Timer} label="In 3 hours" onClick={() => set("3h", inHours(3))} pending={pendingFor("3h")} disabled={mutation.isPending} />
        <OptionButton icon={Timer} label="Tomorrow" sub="9:00 AM" onClick={() => set("tomorrow", tomorrowMorning())} pending={pendingFor("tomorrow")} disabled={mutation.isPending} />
        <OptionButton icon={Clock} label="Custom time..." onClick={() => setCustom((v) => !v)} selected={custom} disabled={mutation.isPending} />
        {custom && (
          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!customValue) return setError("Choose a date and time.");
              set("custom", new Date(customValue));
            }}
          >
            <label htmlFor="follow-up-custom" className="sr-only">
              Follow-up date and time
            </label>
            <input
              id="follow-up-custom"
              type="datetime-local"
              className={slateInput}
              min={localInputValue(new Date())}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              autoFocus
            />
            <button type="submit" className={primaryBtn} disabled={mutation.isPending}>
              {pendingFor("custom") ? "Saving…" : "Set"}
            </button>
          </form>
        )}
        {conversation.follow_up_at && (
          <OptionButton icon={BellOff} label="Clear follow-up" onClick={() => set("clear", null)} pending={pendingFor("clear")} disabled={mutation.isPending} />
        )}
        <InlineError message={error} />
      </div>
    </ChatModal>
  );
}

/* ------------------------------------------------------------- escalate */

const ESCALATE_OPTIONS: { to: EscalationTarget; label: string; icon: typeof ArrowUpCircle }[] = [
  { to: "management", label: "To Manager", icon: ArrowUpCircle },
  { to: "procurement", label: "To Procurement", icon: Package },
  { to: "finance", label: "To Finance", icon: DollarSign },
];

export function EscalateModal({ conversation, open, onClose }: ModalProps) {
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<EscalationTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setNote("");
    setError(null);
    onClose();
  };
  const mutation = useConversationMutation(
    conversation.id,
    (to: EscalationTarget) => chatApi.escalate(conversation.id, to, note.trim()),
    { success: "Conversation escalated — the team has been notified", onSuccess: close, onError: (e) => setError(errorText(e)) },
  );
  return (
    <ChatModal open={open} onClose={close} title="Escalate Conversation">
      <div className="space-y-2">
        <label htmlFor="escalate-note" className="block text-xs text-slate-600 mb-1">
          Note for the team (optional)
        </label>
        <textarea
          id="escalate-note"
          rows={2}
          className={`${slateInput} resize-none mb-2`}
          placeholder="What needs attention?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {ESCALATE_OPTIONS.map((o) => (
          <OptionButton
            key={o.to}
            icon={o.icon}
            label={o.label}
            selected={conversation.escalated_to === o.to}
            trailing={conversation.escalated_to === o.to ? <span className="text-xs text-slate-500">Current</span> : undefined}
            pending={mutation.isPending && target === o.to}
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              setTarget(o.to);
              mutation.mutate(o.to);
            }}
          />
        ))}
        <InlineError message={error} />
      </div>
    </ChatModal>
  );
}

/* ------------------------------------------------------------- reassign */

export function ReassignModal({ conversation, open, onClose }: ModalProps) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agents = useQuery({ queryKey: chatKeys.agents, queryFn: chatApi.agents, enabled: open });
  const close = () => {
    setError(null);
    onClose();
  };
  const mutation = useConversationMutation(conversation.id, (agent: number) => chatApi.assign(conversation.id, agent), {
    success: (c) => `Assigned to ${c.assigned_agent?.full_name ?? "agent"}`,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.agents });
      close();
    },
    onError: (e) => setError(errorText(e)),
  });

  return (
    <ChatModal open={open} onClose={close} title="Reassign Conversation" size="md">
      <p className="text-sm text-slate-600 mb-4">
        Currently assigned to: <span className="text-slate-900">{conversation.assigned_agent?.full_name ?? "Nobody"}</span>
      </p>
      {agents.isPending ? (
        <div className="space-y-2" aria-busy>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : agents.isError ? (
        <div className="text-sm text-slate-600 space-y-2">
          <InlineError message={errorText(agents.error)} />
          <button type="button" className={secondaryBtn} onClick={() => agents.refetch()}>
            Try again
          </button>
        </div>
      ) : agents.data.length === 0 ? (
        <p className="text-sm text-slate-600">No active staff available.</p>
      ) : (
        <div className="space-y-2">
          {agents.data.map((a) => {
            const current = conversation.assigned_agent?.id === a.id;
            return (
              <OptionButton
                key={a.id}
                label={
                  <span className="flex items-center gap-3">
                    <Avatar name={a.full_name} />
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-900 truncate">{a.full_name}</span>
                      <span className="block text-xs text-slate-600">{a.department || "—"}</span>
                    </span>
                  </span>
                }
                selected={current}
                disabled={current || mutation.isPending}
                pending={mutation.isPending && target === a.id}
                onClick={() => {
                  setError(null);
                  setTarget(a.id);
                  mutation.mutate(a.id);
                }}
                trailing={
                  current ? (
                    <span className="px-2.5 py-1 rounded-md text-xs bg-slate-900 text-white inline-flex items-center gap-1">
                      <Check className="size-3" /> Assigned
                    </span>
                  ) : (
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
                        a.open_chats === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : a.open_chats < 10
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {a.open_chats} open chat{a.open_chats === 1 ? "" : "s"}
                    </span>
                  )
                }
              />
            );
          })}
        </div>
      )}
      <div className="mt-3">
        <InlineError message={error} />
      </div>
    </ChatModal>
  );
}
