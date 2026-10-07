"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileText, MessageSquare, Plus, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";

import { ApproveDialog, NewQuoteDialog, RespondDialog, ServiceTypeBadge } from "@/components/orders/quote-dialogs";
import { useOrderAccess, useOrderMutation } from "@/components/orders/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { orderKeys, quotesApi, type Quote } from "@/lib/api/services/orders";
import { formatDate, formatDateTime, formatTSh } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

type Tab = "new" | "answered" | "waiting_reply";
const TAB_STATUS: Record<Tab, string> = { new: "new,declined", answered: "answered", waiting_reply: "waiting_reply" };
const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";

export function IntakeView() {
  const meta = pageMeta["/intake-quotes"];
  const { canQuote, canApprove } = useOrderAccess();
  const [f, setF] = useUrlFilters({ tab: "new", search: "", page: "1" });
  const tab = f.tab as Tab;
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const query = { status: TAB_STATUS[tab], search: f.search, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: [...orderKeys.quotes, "list", query],
    queryFn: ({ signal }) => quotesApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: [...orderKeys.quotes, "stats"], queryFn: quotesApi.stats });
  const counts = stats.data
    ? { new: stats.data.new + stats.data.declined, answered: stats.data.answered, waiting_reply: stats.data.waiting_reply }
    : undefined;

  const [responding, setResponding] = useState<Quote | null>(null);
  const [approving, setApproving] = useState<Quote | null>(null);
  const [creating, setCreating] = useState(false);
  const reply = useOrderMutation(({ id, accepted }: { id: number; accepted: boolean }) => quotesApi.reply(id, accepted), {
    success: (q) => ((q as Quote).status === "answered" ? "Customer acceptance recorded" : "Customer declined — quotation moved to New"),
  });
  const rows = list.data?.results ?? [];

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={canQuote && <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New Quotation</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="New Quotations" value={counts?.new} icon={FileText} tone="orange" loading={!counts} />
        <StatCard label="Answered" value={counts?.answered} icon={CheckCircle2} tone="green" loading={!counts} />
        <StatCard label="Waiting for Reply" value={counts?.waiting_reply} icon={Clock} tone="yellow" loading={!counts} />
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <PillTabs<Tab>
            value={tab}
            onChange={(t) => setF({ tab: t })}
            options={[
              { value: "new", label: `New Quotations (${counts?.new ?? "…"})`, activeClass: "bg-orange-600" },
              { value: "answered", label: `Answered Quotations (${counts?.answered ?? "…"})`, activeClass: "bg-green-600" },
              { value: "waiting_reply", label: `Waiting for Reply (${counts?.waiting_reply ?? "…"})`, activeClass: "bg-yellow-600" },
            ]}
          />
          <SearchInput placeholder="Search quotations..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search quotations" className="lg:max-w-xs" />
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className={th}>Quote ID</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Service Type</th>
                  <th className={th}>Description</th>
                  <th className={th}>Route</th>
                  <th className={th}>Request Date</th>
                  {tab !== "new" && (
                    <>
                      <th className={th}>Quoted Amount</th>
                      <th className={th}>Responded By</th>
                    </>
                  )}
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.isPending
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: tab === "new" ? 7 : 9 }).map((__, j) => (
                          <td key={j} className="px-6 py-4"><div className="h-4 rounded bg-gray-200 animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : rows.map((q) => (
                      <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 whitespace-nowrap">{q.reference}</div>
                          {q.status === "declined" && <span className="text-xs font-medium text-red-600">Declined — re-quote</span>}
                        </td>
                        <td className="px-6 py-4 text-gray-900">{q.customer.full_name}</td>
                        <td className="px-6 py-4"><ServiceTypeBadge type={q.service_type} /></td>
                        <td className="px-6 py-4"><div className="text-gray-900 max-w-xs">{q.description}</div></td>
                        <td className="px-6 py-4">
                          {q.origin || q.destination ? (
                            <div className="text-sm text-gray-900">
                              <div className="font-medium">{q.origin || "Origin TBD"}</div>
                              <div className="text-gray-500">→ {q.destination || "—"}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-900 text-sm">{formatDateTime(q.requested_at)}</td>
                        {tab !== "new" && (
                          <>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(q.quoted_amount)}</div>
                              {q.estimated_delivery && <div className="text-xs text-gray-500">ETA: {formatDate(q.estimated_delivery)}</div>}
                            </td>
                            <td className="px-6 py-4 text-gray-900 text-sm">{q.responded_by?.full_name ?? "—"}</td>
                          </>
                        )}
                        <td className="px-6 py-4">
                          {tab === "new" ? (
                            canQuote && (
                              <button type="button" onClick={() => setResponding(q)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-2">
                                <Send className="size-4" />
                                Respond
                              </button>
                            )
                          ) : tab === "answered" ? (
                            canApprove && (
                              <button type="button" onClick={() => setApproving(q)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm whitespace-nowrap">
                                Approve Order
                              </button>
                            )
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-yellow-600">
                                <Clock className="size-4" />
                                <span className="text-sm font-medium whitespace-nowrap">Awaiting Customer</span>
                              </div>
                              {canQuote && (
                                <div className="flex gap-2">
                                  <button type="button" disabled={reply.isPending} onClick={() => reply.mutate({ id: q.id, accepted: true })} className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900" title="Customer accepted">
                                    <ThumbsUp className="size-3.5" /> Accepted
                                  </button>
                                  <button type="button" disabled={reply.isPending} onClick={() => reply.mutate({ id: q.id, accepted: false })} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800" title="Customer declined">
                                    <ThumbsDown className="size-3.5" /> Declined
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setF({ page: String(p) })} />
          )}
        </Card>
      )}

      {list.data && rows.length === 0 && (
        <Card className="p-12 text-center mt-6">
          <MessageSquare className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No quotations in this category</p>
        </Card>
      )}

      <RespondDialog quote={responding} onClose={() => setResponding(null)} />
      <ApproveDialog quote={approving} onClose={() => setApproving(null)} />
      <NewQuoteDialog open={creating} onClose={() => setCreating(false)} />
    </PageContainer>
  );
}
