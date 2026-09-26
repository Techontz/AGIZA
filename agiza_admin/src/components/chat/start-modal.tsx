"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageSquarePlus, Search } from "lucide-react";
import { useState } from "react";

import { useApiMutation } from "@/hooks/use-api-mutation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorText } from "@/lib/api/errors";
import { chatApi, chatKeys, type ChatChannel, type Conversation } from "@/lib/api/services/chat";
import { customersApi, type Customer } from "@/lib/api/services/orders";

import { Avatar, ChatModal, InlineError, OptionButton, primaryBtn, secondaryBtn, slateInput } from "./chat-modal";
import { CHANNELS } from "./config";

/** Start an outbound conversation with a known client. */
export function StartConversationModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (c: Conversation) => void;
}) {
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [channel, setChannel] = useState<ChatChannel>("whatsapp");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebouncedValue(search.trim());
  const customers = useQuery({
    queryKey: ["customers", "search", debounced],
    queryFn: () => customersApi.search(debounced),
    enabled: open && !customer && debounced.length > 0,
  });
  const mutation = useApiMutation(() => chatApi.start({ customer: (customer as Customer).id, channel, body: body.trim() }), {
    invalidate: [chatKeys.lists, chatKeys.stats],
    success: "Conversation started",
    onSuccess: onStarted,
    onError: (e) => setError(errorText(e)),
  });

  return (
    <ChatModal open={open} onClose={onClose} title="New Conversation" size="md">
      {!customer ? (
        <>
          <p className="text-sm text-slate-600 mb-4">Find the client to message:</p>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <label htmlFor="start-search" className="sr-only">Search clients</label>
            <input id="start-search" type="search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone..." className={`${slateInput} pl-9 pr-4`} />
          </div>
          <div className="space-y-2">
            {debounced.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">Type a name, phone number or client ID.</p>
            ) : customers.isPending ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />)
            ) : customers.isError ? (
              <InlineError message={errorText(customers.error)} />
            ) : customers.data.results.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No clients match your search.</p>
            ) : (
              customers.data.results.map((c) => (
                <OptionButton
                  key={c.id}
                  label={
                    <span className="flex items-center gap-3">
                      <Avatar name={c.full_name} />
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-900 truncate">{c.full_name}</span>
                        <span className="block text-xs text-slate-600 font-mono truncate">{c.phone || c.email || c.reference}</span>
                      </span>
                    </span>
                  }
                  onClick={() => setCustomer(c)}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate(undefined);
          }}
        >
          <div className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={customer.full_name} />
              <div className="min-w-0">
                <p className="text-sm text-slate-900 truncate">{customer.full_name}</p>
                <p className="text-xs text-slate-600 font-mono truncate">{customer.phone || customer.email || customer.reference}</p>
              </div>
            </div>
            <button type="button" className="text-xs text-slate-600 hover:text-slate-900 underline" onClick={() => setCustomer(null)}>
              Change
            </button>
          </div>
          <div>
            <label htmlFor="start-channel" className="block text-xs text-slate-600 mb-1">Channel</label>
            <select id="start-channel" className={slateInput} value={channel} onChange={(e) => setChannel(e.target.value as ChatChannel)}>
              {(Object.keys(CHANNELS) as ChatChannel[]).map((k) => (
                <option key={k} value={k}>{CHANNELS[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="start-body" className="block text-xs text-slate-600 mb-1">First message (optional)</label>
            <textarea id="start-body" rows={3} className={`${slateInput} resize-none`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message..." />
          </div>
          <InlineError message={error} />
          <div className="flex gap-2 justify-end">
            <button type="button" className={secondaryBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={primaryBtn} disabled={mutation.isPending}>
              <MessageSquarePlus className="size-4" />
              {mutation.isPending ? "Starting…" : "Start Conversation"}
            </button>
          </div>
        </form>
      )}
    </ChatModal>
  );
}
