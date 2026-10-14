"use client";

import { CloudOff, Mic, MousePointerClick, Paperclip, Send, StickyNote, Trash2, UserCheck, Zap } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { QuickReply } from "@/lib/api/services/chat";
import { cn } from "@/lib/cn";

import { formatDuration, useVoiceRecorder } from "./voice-recorder";

/** What the server accepts in chat: photos, PDF, Word and Excel (voice notes are recorded here). */
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx";

export interface ComposerHandle {
  focus: () => void;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    value: string;
    onChange: (v: string) => void;
    internal: boolean;
    onInternalChange: (v: boolean) => void;
    onSend: () => void;
    sending: boolean;
    disabled: boolean;
    disabledReason?: string;
    quickReplies: QuickReply[] | undefined;
    channelLabel: string;
    channelConnected: boolean | undefined;
    error: string | null;
    conflict: { message: string; onTakeOver: () => void; pending: boolean } | null;
    /** Someone else is the active handler (sending will be refused). */
    handlerNotice?: string | null;
    /** Send a photo / document (with the typed text as its caption) or a recorded voice note. */
    onSendFile?: (file: File, durationMs?: number) => void;
  }
>(function Composer(
  { value, onChange, internal, onInternalChange, onSend, sending, disabled, disabledReason, quickReplies, channelLabel, channelConnected, error, conflict, handlerNotice, onSendFile },
  ref,
) {
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const voice = useVoiceRecorder();
  const canAttach = Boolean(onSendFile) && !internal && !disabled && !sending;
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  // Grow with the text (up to ~6 lines).
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const canSend = !disabled && !sending && value.trim().length > 0;

  return (
    <>
      {/* Quick Replies */}
      {!disabled && quickReplies && quickReplies.length > 0 && (
        <div className="bg-white border-t border-slate-200 px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs text-slate-500 flex items-center gap-1 flex-shrink-0">
              <Zap className="size-3" />
              Quick:
            </span>
            {quickReplies.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onChange(r.text);
                  input.current?.focus();
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs transition-all whitespace-nowrap inline-flex items-center gap-1"
              >
                <MousePointerClick className="size-3" />
                {r.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="bg-white border-t border-slate-200 p-4">
        {conflict && (
          <div role="alert" className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-red-700">{conflict.message}</span>
            <button
              type="button"
              onClick={conflict.onTakeOver}
              disabled={conflict.pending}
              className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <UserCheck className="size-3" />
              {conflict.pending ? "Taking over…" : "Take Over"}
            </button>
          </div>
        )}
        {!conflict && error && (
          <p role="alert" className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {internal ? (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <StickyNote className="size-4" />
              <span>Composing internal note (not visible to client)</span>
            </div>
            <button type="button" onClick={() => onInternalChange(false)} className="text-xs text-amber-600 hover:text-amber-800 transition-colors">
              Switch to client message
            </button>
          </div>
        ) : (
          channelConnected === false &&
          !disabled && (
            <p className="mb-2 text-xs text-slate-500 inline-flex items-center gap-1.5">
              <CloudOff className="size-3.5" />
              {channelLabel} is not connected — replies are saved but not delivered.
            </p>
          )
        )}
        {handlerNotice && (
          <p className="mb-2 text-xs text-amber-700 inline-flex items-center gap-1.5">
            <UserCheck className="size-3.5" />
            {handlerNotice}
          </p>
        )}
        {disabled && disabledReason && <p className="mb-2 text-xs text-slate-500">{disabledReason}</p>}
        {voice.error && <p role="alert" className="mb-2 text-xs text-red-700">{voice.error}</p>}
        {voice.recording ? (
          <div className="flex items-center gap-3" role="group" aria-label="Recording a voice note">
            <button
              type="button"
              onClick={voice.cancel}
              className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-600"
              aria-label="Discard voice note"
              title="Discard"
            >
              <Trash2 className="size-5" />
            </button>
            <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <span className="size-2.5 rounded-full bg-red-600 animate-pulse" aria-hidden />
              Recording… <span className="font-mono">{formatDuration(voice.elapsed)}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                const note = await voice.stop();
                if (note) onSendFile?.(note.file, note.durationMs);
              }}
              aria-label="Send voice note"
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800"
            >
              <Send className="size-5 text-white" />
            </button>
          </div>
        ) : (
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) onSend();
          }}
        >
          <button
            type="button"
            onClick={() => onInternalChange(!internal)}
            disabled={disabled}
            aria-pressed={internal}
            className={cn(
              "p-2 rounded-lg transition-colors disabled:opacity-50",
              internal ? "bg-amber-100 text-amber-700" : "hover:bg-slate-100 text-slate-600",
            )}
            title="Toggle internal note"
            aria-label="Toggle internal note"
          >
            <StickyNote className="size-5" />
          </button>
          {onSendFile && !internal && (
            <>
              <input
                ref={picker}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onSendFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => picker.current?.click()}
                disabled={!canAttach}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-50"
                title="Send a photo or document (the typed text is sent as its caption)"
                aria-label="Attach a photo or document"
              >
                <Paperclip className="size-5" />
              </button>
            </>
          )}
          <label htmlFor="chat-composer" className="sr-only">
            {internal ? "Internal note" : "Message"}
          </label>
          <textarea
            id="chat-composer"
            ref={input}
            rows={1}
            placeholder={internal ? "Add internal note (staff only)..." : "Type your message..."}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm resize-none leading-5 disabled:bg-slate-50"
          />
          {onSendFile && !internal && !value.trim() && (
            <button
              type="button"
              onClick={voice.start}
              disabled={!canAttach}
              aria-label="Record a voice note"
              title="Record a voice note"
              className="p-2.5 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-50"
            >
              <Mic className="size-5" />
            </button>
          )}
          <button
            type="submit"
            disabled={!canSend}
            aria-label={internal ? "Add internal note" : "Send message"}
            className={cn(
              "p-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              internal ? "bg-amber-600 hover:bg-amber-700" : "bg-slate-900 hover:bg-slate-800",
            )}
          >
            {sending ? (
              <span className="block size-5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
            ) : (
              <Send className="size-5 text-white" />
            )}
          </button>
        </form>
        )}
      </div>
    </>
  );
});
