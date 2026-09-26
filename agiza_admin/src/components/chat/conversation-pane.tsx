"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorState, Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { can } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { chatApi, chatKeys, type ChatMessage, type Conversation, type Quotation } from "@/lib/api/services/chat";
import { orderKeys, quotesApi } from "@/lib/api/services/orders";
import type { Me } from "@/lib/api/types";

import { ActionPanel } from "./action-panel";
import { ChatModal, primaryBtn, secondaryBtn } from "./chat-modal";
import { Composer, type ComposerHandle } from "./composer";
import { CHANNELS, displayName } from "./config";
import { ConversationHeader } from "./conversation-header";
import { LinkModal } from "./link-modal";
import { MessageThread } from "./message-thread";
import { EscalateModal, FollowUpModal, ReassignModal } from "./modals";
import { CreateQuoteModal, SendQuoteModal } from "./quote-modals";
import { useConversationMutation } from "./use-chat-mutation";

const POLL_MS = 10_000;

type ModalKind = "follow-up" | "escalate" | "reassign" | "link" | "link-records" | "create-quote" | "send-quote" | null;

export function ConversationPane({
  id,
  placeholder,
  me,
  onBack,
}: {
  id: number;
  placeholder: Conversation | undefined;
  me: Me | undefined;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const canEdit = can(me, "chat", "edit");
  const canAcceptQuote = can(me, "intake_quotes", "edit");

  const conversation = useQuery({
    queryKey: chatKeys.one(id),
    queryFn: ({ signal }) => chatApi.get(id, signal),
    placeholderData: placeholder,
    refetchInterval: POLL_MS,
  });
  const messages = useQuery({
    queryKey: chatKeys.messages(id),
    queryFn: ({ signal }) => chatApi.messages(id, signal),
    refetchInterval: POLL_MS,
  });
  const channels = useQuery({ queryKey: chatKeys.channels, queryFn: chatApi.channels, staleTime: 5 * 60_000 });
  const quickReplies = useQuery({ queryKey: chatKeys.quickReplies, queryFn: chatApi.quickReplies, staleTime: 5 * 60_000 });

  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [accepting, setAccepting] = useState<Quotation | null>(null);
  const composer = useRef<ComposerHandle>(null);

  /* ---- mark as read when opened and whenever a new customer message arrives */
  const { mutate: markRead } = useMutation({
    mutationFn: () => chatApi.markRead(id),
    onSuccess: (c) => {
      qc.setQueryData(chatKeys.one(id), c);
      qc.invalidateQueries({ queryKey: chatKeys.lists });
    },
  });
  const lastCustomerId = useMemo(() => {
    const rows = messages.data ?? [];
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sender === "customer") return rows[i].id;
    return 0;
  }, [messages.data]);
  const loaded = messages.data !== undefined;
  useEffect(() => {
    if (loaded) markRead();
  }, [loaded, lastCustomerId, markRead]);

  /* ---- actions */
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: chatKeys.one(id) });
    qc.invalidateQueries({ queryKey: chatKeys.messages(id) });
    qc.invalidateQueries({ queryKey: chatKeys.lists });
    qc.invalidateQueries({ queryKey: chatKeys.stats });
  };

  const send = useMutation({
    mutationFn: (vars: { body: string; internal: boolean }) => chatApi.send(id, vars.body, vars.internal),
    onSuccess: (msg, vars) => {
      qc.setQueryData<ChatMessage[]>(chatKeys.messages(id), (old) => (old ? [...old, msg] : [msg]));
      setDraft("");
      setSendError(null);
      setConflict(null);
      refreshAll();
      if (vars.internal) toast.success("Internal note added");
      else if (msg.delivery_status === "stored") toast.warning(`Saved but not delivered — ${msg.delivery_error || "channel not connected"}`);
      else if (msg.delivery_status === "failed") toast.error(`Message saved but delivery failed — ${msg.delivery_error || "try again later"}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(errorText(e));
        setSendError(null);
      } else {
        setSendError(errorText(e));
      }
    },
  });

  const takeOver = useConversationMutation(id, () => chatApi.takeOver(id), {
    success: "You're now handling this conversation",
    onSuccess: () => setConflict(null),
  });
  const release = useConversationMutation(id, () => chatApi.release(id), { success: "Conversation released" });
  const archive = useConversationMutation(id, () => chatApi.archive(id), { success: "Conversation archived" });
  const reopen = useConversationMutation(id, () => chatApi.reopen(id), { success: "Conversation reopened" });
  const clearFollowUp = useConversationMutation(id, () => chatApi.followUp(id, null), { success: "Follow-up cleared" });
  const resend = useApiMutation((quote: number) => chatApi.sendQuote(id, quote), {
    invalidate: [chatKeys.messages(id), chatKeys.one(id), chatKeys.lists],
    success: (m) => (m.delivery_status === "stored" ? "Quotation saved (channel not connected)" : "Quotation resent"),
  });
  const acceptQuote = useApiMutation((q: Quotation) => quotesApi.reply(q.id, true), {
    invalidate: [chatKeys.messages(id), chatKeys.one(id), chatKeys.lists, orderKeys.quotes],
    success: (q) => `Client acceptance recorded for ${q.reference}`,
    onSuccess: () => setAccepting(null),
  });

  const conv = conversation.data;

  if (!conv) {
    if (conversation.isError) {
      return (
        <div className="flex-1 flex flex-col bg-white">
          <ErrorState
            bare
            message={conversation.error instanceof ApiError && conversation.error.status === 404 ? "This conversation doesn't exist or was removed." : errorText(conversation.error)}
            onRetry={() => conversation.refetch()}
          />
          <div className="text-center">
            <button type="button" className={secondaryBtn} onClick={onBack}>
              Back to conversations
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col bg-white" aria-busy>
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 space-y-3">
          <div className="h-20 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-9 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-16 rounded-lg bg-white/10 animate-pulse" />
        </div>
        <div className="flex-1 p-6 bg-slate-50 space-y-4">
          <Skeleton className="h-12 w-1/2 bg-slate-200" />
          <Skeleton className="h-12 w-1/3 ml-auto bg-slate-200" />
          <Skeleton className="h-12 w-2/5 bg-slate-200" />
        </div>
      </div>
    );
  }

  const handlerIsOther = Boolean(conv.active_handler) && conv.active_handler?.id !== me?.id;
  const channel = CHANNELS[conv.channel];

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    setSendError(null);
    send.mutate({ body, internal });
  };

  const paymentReminder = () => {
    const ref = conv.order?.reference ?? conv.quote?.reference;
    const name = conv.customer?.full_name ?? conv.contact_name;
    setInternal(false);
    setDraft(
      `Hello ${name}, this is a friendly reminder that payment${ref ? ` for ${ref}` : ""} is still pending. ` +
        "Please let us know once it's done, or reply if you need the payment details again. Thank you!",
    );
    composer.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      <ConversationHeader
        conv={conv}
        meId={me?.id}
        canEdit={canEdit}
        pending={{ takeOver: takeOver.isPending, release: release.isPending, status: archive.isPending || reopen.isPending, followUp: clearFollowUp.isPending }}
        actions={{
          onBack,
          onLink: () => setModal("link"),
          onLinkRecords: () => setModal("link-records"),
          onFollowUp: () => setModal("follow-up"),
          onClearFollowUp: () => clearFollowUp.mutate(undefined),
          onEscalate: () => setModal("escalate"),
          onTakeOver: () => takeOver.mutate(undefined),
          onRelease: () => release.mutate(undefined),
          onArchive: () => archive.mutate(undefined),
          onReopen: () => reopen.mutate(undefined),
        }}
      />

      <ActionPanel
        conv={conv}
        canEdit={canEdit}
        pending={{ resend: resend.isPending, status: archive.isPending || reopen.isPending }}
        handlers={{
          onCreateQuote: () => setModal("create-quote"),
          onSendQuote: () => setModal("send-quote"),
          onResendQuote: () => conv.quote && resend.mutate(conv.quote.id),
          onPaymentReminder: paymentReminder,
          onArchive: () => archive.mutate(undefined),
          onReopen: () => reopen.mutate(undefined),
          onReassign: () => setModal("reassign"),
        }}
      />

      <MessageThread
        messages={messages.data}
        loading={messages.isPending}
        error={messages.isError ? errorText(messages.error) : null}
        onRetry={() => messages.refetch()}
        canAcceptQuote={canEdit && canAcceptQuote}
        acceptingQuoteId={acceptQuote.isPending ? (accepting?.id ?? null) : null}
        onAcceptQuote={setAccepting}
      />

      <Composer
        ref={composer}
        value={draft}
        onChange={(v) => {
          setDraft(v);
          if (sendError) setSendError(null);
        }}
        internal={internal}
        onInternalChange={setInternal}
        onSend={submit}
        sending={send.isPending}
        disabled={!canEdit}
        disabledReason={canEdit ? undefined : "You have view-only access to chat."}
        quickReplies={quickReplies.data}
        channelLabel={channel.label}
        channelConnected={channels.data ? channels.data[conv.channel] === true : undefined}
        error={sendError}
        conflict={conflict ? { message: conflict, onTakeOver: () => takeOver.mutate(undefined), pending: takeOver.isPending } : null}
        handlerNotice={
          canEdit && handlerIsOther && !conflict && !internal
            ? `${conv.active_handler?.full_name} is handling this conversation — take over to reply.`
            : null
        }
      />

      {modal === "follow-up" && <FollowUpModal open conversation={conv} onClose={() => setModal(null)} />}
      {modal === "escalate" && <EscalateModal open conversation={conv} onClose={() => setModal(null)} />}
      {modal === "reassign" && <ReassignModal open conversation={conv} onClose={() => setModal(null)} />}
      {(modal === "link" || modal === "link-records") && (
        <LinkModal open conversation={conv} initialTab={modal === "link-records" ? "order" : "client"} onClose={() => setModal(null)} />
      )}
      {modal === "create-quote" && <CreateQuoteModal open conversation={conv} onClose={() => setModal(null)} onLinkClient={() => setModal("link")} />}
      {modal === "send-quote" && <SendQuoteModal open conversation={conv} onClose={() => setModal(null)} onLinkClient={() => setModal("link")} />}

      <ChatModal open={accepting !== null} onClose={() => !acceptQuote.isPending && setAccepting(null)} title="Accept Quote">
        <p className="text-sm text-slate-600 mb-6">
          Record that <span className="text-slate-900">{displayName(conv)}</span> accepted quotation{" "}
          <span className="font-mono text-slate-900">{accepting?.reference}</span>? It moves to Answered in Intake &amp; Quotes, ready to approve into an order.
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" className={secondaryBtn} onClick={() => setAccepting(null)} disabled={acceptQuote.isPending}>
            Cancel
          </button>
          <button type="button" className={primaryBtn} disabled={acceptQuote.isPending} onClick={() => accepting && acceptQuote.mutate(accepting)}>
            <CheckCircle className="size-4" />
            {acceptQuote.isPending ? "Recording…" : "Accept Quote"}
          </button>
        </div>
      </ChatModal>
    </div>
  );
}

