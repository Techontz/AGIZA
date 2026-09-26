"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { chatApi, chatKeys, type Conversation, type QuoteServiceType } from "@/lib/api/services/chat";
import { orderKeys, quotesApi } from "@/lib/api/services/orders";
import { formatTSh } from "@/lib/format";

import { ChatModal, InlineError, OptionButton, primaryBtn, secondaryBtn, slateInput } from "./chat-modal";
import { quoteHref } from "./config";
import { useConversationMutation } from "./use-chat-mutation";

interface ModalProps {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
  /** Open the link modal (a client must be linked first). */
  onLinkClient: () => void;
}

function NeedsClient({ onLinkClient }: { onLinkClient: () => void }) {
  return (
    <div className="text-center py-2">
      <p className="text-sm text-slate-600 mb-4">Link this conversation to a client first — quotations belong to a client.</p>
      <button type="button" className={primaryBtn} onClick={onLinkClient}>
        <Link2 className="size-4" /> Link to Existing Client
      </button>
    </div>
  );
}

/* --------------------------------------------------------- create quote */

export function CreateQuoteModal({ conversation, open, onClose, onLinkClient }: ModalProps) {
  const qc = useQueryClient();
  const [serviceType, setServiceType] = useState<QuoteServiceType>("international");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const mutation = useConversationMutation(
    conversation.id,
    () => chatApi.createQuote(conversation.id, { service_type: serviceType, description: description.trim(), origin: origin.trim(), destination: destination.trim() }),
    {
      success: (c) => `Quotation ${c.quote?.reference ?? ""} created — price it in Intake & Quotes`,
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: orderKeys.quotes });
        onClose();
      },
      onError: (e) => {
        setErrors(fieldErrors(e));
        setError(Object.keys(fieldErrors(e)).length ? null : errorText(e));
      },
    },
  );

  return (
    <ChatModal open={open} onClose={onClose} title="Create Quote" size="md">
      {!conversation.customer ? (
        <NeedsClient onLinkClient={onLinkClient} />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!description.trim()) return setErrors({ description: "Describe what the customer wants." });
            setErrors({});
            setError(null);
            mutation.mutate(undefined);
          }}
        >
          <p className="text-sm text-slate-600">
            New quotation request for <span className="text-slate-900">{conversation.customer.full_name}</span>. It goes to Intake &amp; Quotes to be priced.
          </p>
          <div>
            <label htmlFor="cq-service" className="block text-xs text-slate-600 mb-1">Service type</label>
            <select id="cq-service" className={slateInput} value={serviceType} onChange={(e) => setServiceType(e.target.value as QuoteServiceType)}>
              <option value="international">International</option>
              <option value="express">Express</option>
              <option value="equipment">Equipment</option>
            </select>
          </div>
          <div>
            <label htmlFor="cq-description" className="block text-xs text-slate-600 mb-1">
              What does the customer want? <span className="text-red-600">*</span>
            </label>
            <textarea
              id="cq-description"
              rows={3}
              autoFocus
              className={`${slateInput} resize-none`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(errors.description) || undefined}
              placeholder="e.g. 50 smartphones from Guangzhou"
            />
            {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cq-origin" className="block text-xs text-slate-600 mb-1">Origin</label>
              <input id="cq-origin" className={slateInput} value={origin} maxLength={120} onChange={(e) => setOrigin(e.target.value)} />
              {errors.origin && <p className="text-xs text-red-600 mt-1">{errors.origin}</p>}
            </div>
            <div>
              <label htmlFor="cq-destination" className="block text-xs text-slate-600 mb-1">Destination</label>
              <input id="cq-destination" className={slateInput} value={destination} maxLength={120} onChange={(e) => setDestination(e.target.value)} />
              {errors.destination && <p className="text-xs text-red-600 mt-1">{errors.destination}</p>}
            </div>
          </div>
          <InlineError message={error} />
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={primaryBtn} disabled={mutation.isPending}>
              <FileText className="size-4" />
              {mutation.isPending ? "Creating…" : "Create Quote"}
            </button>
          </div>
        </form>
      )}
    </ChatModal>
  );
}

/* ----------------------------------------------------------- send quote */

export function SendQuoteModal({ conversation, open, onClose, onLinkClient }: ModalProps) {
  const qc = useQueryClient();
  const customerId = conversation.customer?.id ?? null;
  const [target, setTarget] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quotes = useQuery({
    queryKey: [...orderKeys.quotes, "list", { customer: customerId, page_size: 50, chat: true }],
    queryFn: () => quotesApi.list({ customer: customerId as number, page_size: 50 }),
    enabled: open && customerId !== null,
  });
  const mutation = useApiMutation((quote: number) => chatApi.sendQuote(conversation.id, quote), {
    invalidate: [chatKeys.messages(conversation.id), chatKeys.one(conversation.id), chatKeys.lists],
    success: "Quotation sent",
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orderKeys.quotes });
      onClose();
    },
    onError: (e) => setError(errorText(e)),
  });

  const usable = (quotes.data?.results ?? []).filter((q) => q.status !== "cancelled" && q.status !== "declined");

  return (
    <ChatModal open={open} onClose={onClose} title="Send Quote" size="md">
      {!customerId ? (
        <NeedsClient onLinkClient={onLinkClient} />
      ) : quotes.isPending ? (
        <div className="space-y-2" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />)}
        </div>
      ) : quotes.isError ? (
        <InlineError message={errorText(quotes.error)} />
      ) : usable.length === 0 ? (
        <p className="text-sm text-slate-600 text-center py-4">
          {conversation.customer?.full_name} has no open quotations. Use <span className="text-slate-900">Create Quote</span> first.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 mb-2">Choose a priced quotation to send as a quotation card:</p>
          {usable.map((q) => {
            const priced = q.quoted_amount !== null;
            return (
              <div key={q.id}>
                <OptionButton
                  icon={FileText}
                  label={<span className="font-mono">{q.reference}</span>}
                  sub={`${q.status_display} · ${q.description}`}
                  disabled={!priced || mutation.isPending}
                  pending={mutation.isPending && target === q.id}
                  selected={conversation.quote?.id === q.id}
                  trailing={
                    priced ? (
                      <span className="text-xs font-mono text-slate-900 whitespace-nowrap inline-flex items-center gap-1.5">
                        {formatTSh(q.quoted_amount)} <Send className="size-3.5 text-slate-400" />
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded whitespace-nowrap">Not priced</span>
                    )
                  }
                  onClick={() => {
                    setError(null);
                    setTarget(q.id);
                    mutation.mutate(q.id);
                  }}
                />
                {!priced && (
                  <Link href={quoteHref(q.reference, q.status)} className="text-xs text-slate-600 underline hover:text-slate-900 ml-1">
                    Price {q.reference} in Intake &amp; Quotes
                  </Link>
                )}
              </div>
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
