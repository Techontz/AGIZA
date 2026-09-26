"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, Package, Search, User } from "lucide-react";
import { useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorText } from "@/lib/api/errors";
import { chatApi, type Conversation } from "@/lib/api/services/chat";
import { customersApi, ordersApi, quotesApi } from "@/lib/api/services/orders";
import { cn } from "@/lib/cn";
import { formatTSh } from "@/lib/format";

import { Avatar, ChatModal, InlineError, OptionButton, slateInput } from "./chat-modal";
import { useConversationMutation } from "./use-chat-mutation";

export type LinkTab = "client" | "order" | "quote";

type Target = { customer: number } | { order: number } | { quote: number };

interface OrderRow {
  id: number;
  reference: string;
  item_details: string;
  status_display: string;
  kind: string;
}

async function customerOrders(customer: number, search: string): Promise<OrderRow[]> {
  const query = { customer, search, page_size: 10 };
  const kinds = [
    ["International", ordersApi.international],
    ["Express", ordersApi.express],
    ["Equipment", ordersApi.equipment],
  ] as const;
  const results = await Promise.allSettled(kinds.map(([, api]) => api.list(query)));
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length === results.length) throw failures[0].reason;
  return results.flatMap((r, i) =>
    r.status === "fulfilled"
      ? r.value.results.map((o) => ({ id: o.id, reference: o.reference, item_details: o.item_details, status_display: o.status_display, kind: kinds[i][0] }))
      : [],
  );
}

export function LinkModal({
  conversation,
  open,
  onClose,
  initialTab = "client",
}: {
  conversation: Conversation;
  open: boolean;
  onClose: () => void;
  initialTab?: LinkTab;
}) {
  const [tab, setTab] = useState<LinkTab>(initialTab);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const debounced = useDebouncedValue(search.trim());
  const customerId = conversation.customer?.id ?? null;
  const activeTab: LinkTab = customerId ? tab : "client";

  const close = () => {
    setSearch("");
    setError(null);
    setTab(initialTab);
    onClose();
  };

  const customers = useQuery({
    queryKey: ["customers", "search", debounced],
    queryFn: () => customersApi.search(debounced),
    enabled: open && activeTab === "client" && debounced.length > 0,
  });
  const orders = useQuery({
    queryKey: ["chat", "link-orders", customerId, debounced],
    queryFn: () => customerOrders(customerId as number, debounced),
    enabled: open && activeTab === "order" && customerId !== null,
  });
  const quotes = useQuery({
    queryKey: ["chat", "link-quotes", customerId, debounced],
    queryFn: () => quotesApi.list({ customer: customerId as number, search: debounced, page_size: 20 }),
    enabled: open && activeTab === "quote" && customerId !== null,
  });

  const mutation = useConversationMutation(conversation.id, (t: Target) => chatApi.link(conversation.id, t), {
    success: "Conversation linked",
    onSuccess: close,
    onError: (e) => setError(errorText(e)),
  });
  const link = (key: string, t: Target) => {
    setError(null);
    setPendingKey(key);
    mutation.mutate(t);
  };
  const isPending = (key: string) => mutation.isPending && pendingKey === key;

  const tabs: { key: LinkTab; label: string; icon: typeof User }[] = [
    { key: "client", label: "Client", icon: User },
    { key: "order", label: "Order", icon: Package },
    { key: "quote", label: "Quotation", icon: FileText },
  ];

  const loading = <div className="space-y-2" aria-busy>{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />)}</div>;
  const empty = (text: string) => <p className="text-sm text-slate-500 text-center py-6">{text}</p>;

  return (
    <ChatModal open={open} onClose={close} title="Link to Existing Client" size="md">
      {customerId && (
        <div className="flex gap-1.5 mb-4" role="tablist" aria-label="What to link">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => {
                setTab(t.key);
                setSearch("");
                setError(null);
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs transition-all inline-flex items-center gap-1.5",
                activeTab === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-slate-600 mb-4">
        {activeTab === "client" ? (
          conversation.customer ? (
            <>
              Linked to <span className="text-slate-900">{conversation.customer.full_name}</span>. Search to link a different client:
            </>
          ) : (
            "Search for an existing client to merge this conversation with:"
          )
        ) : activeTab === "order" ? (
          <>Link one of {conversation.customer?.full_name}&apos;s orders{conversation.order ? <> (currently <span className="font-mono text-slate-900">{conversation.order.reference}</span>)</> : null}:</>
        ) : (
          <>Link one of {conversation.customer?.full_name}&apos;s quotations{conversation.quote ? <> (currently <span className="font-mono text-slate-900">{conversation.quote.reference}</span>)</> : null}:</>
        )}
      </p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <label htmlFor="link-search" className="sr-only">
          Search
        </label>
        <input
          id="link-search"
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={activeTab === "client" ? "Search by name or phone..." : "Search by reference..."}
          className={`${slateInput} pl-9 pr-4`}
        />
      </div>

      <div className="space-y-2">
        {activeTab === "client" &&
          (debounced.length === 0
            ? empty("Type a name, phone number or client ID.")
            : customers.isPending
              ? loading
              : customers.isError
                ? <InlineError message={errorText(customers.error)} />
                : customers.data.results.length === 0
                  ? empty("No clients match your search.")
                  : customers.data.results.map((c) => (
                      <OptionButton
                        key={c.id}
                        label={
                          <span className="flex items-center gap-3">
                            <Avatar name={c.full_name} />
                            <span className="min-w-0 text-left">
                              <span className="block text-sm text-slate-900 truncate">{c.full_name}</span>
                              <span className="block text-xs text-slate-600 font-mono truncate">{c.phone || c.email || c.reference}</span>
                            </span>
                          </span>
                        }
                        selected={c.id === customerId}
                        disabled={c.id === customerId || mutation.isPending}
                        pending={isPending(`c${c.id}`)}
                        trailing={<Link2 className="size-4 text-slate-400" />}
                        onClick={() => link(`c${c.id}`, { customer: c.id })}
                      />
                    )))}

        {activeTab === "order" &&
          (orders.isPending
            ? loading
            : orders.isError
              ? <InlineError message={errorText(orders.error)} />
              : orders.data.length === 0
                ? empty("No orders found for this client.")
                : orders.data.map((o) => (
                    <OptionButton
                      key={o.id}
                      icon={Package}
                      label={<span className="font-mono">{o.reference}</span>}
                      sub={`${o.kind} · ${o.status_display} · ${o.item_details}`}
                      selected={conversation.order?.id === o.id}
                      disabled={conversation.order?.id === o.id || mutation.isPending}
                      pending={isPending(`o${o.id}`)}
                      trailing={<Link2 className="size-4 text-slate-400" />}
                      onClick={() => link(`o${o.id}`, { order: o.id })}
                    />
                  )))}

        {activeTab === "quote" &&
          (quotes.isPending
            ? loading
            : quotes.isError
              ? <InlineError message={errorText(quotes.error)} />
              : quotes.data.results.length === 0
                ? empty("No quotations found for this client.")
                : quotes.data.results.map((q) => (
                    <OptionButton
                      key={q.id}
                      icon={FileText}
                      label={<span className="font-mono">{q.reference}</span>}
                      sub={`${q.status_display} · ${q.quoted_amount ? formatTSh(q.quoted_amount) : "Not priced"} · ${q.description}`}
                      selected={conversation.quote?.id === q.id}
                      disabled={conversation.quote?.id === q.id || mutation.isPending}
                      pending={isPending(`q${q.id}`)}
                      trailing={<Link2 className="size-4 text-slate-400" />}
                      onClick={() => link(`q${q.id}`, { quote: q.id })}
                    />
                  )))}
        <InlineError message={error} />
      </div>
    </ChatModal>
  );
}
