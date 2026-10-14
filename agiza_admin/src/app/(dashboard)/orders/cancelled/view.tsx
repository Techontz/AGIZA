"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Ban, History, RotateCcw, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StatusHistoryList, useOrderAccess, useOrderMutation } from "@/components/orders/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SearchInput, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cancelledApi, orderKeys, type CancelledOrder } from "@/lib/api/services/orders";
import { formatDateTime, formatTSh } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap";
const select = "w-auto bg-white";

/** Where each order type is managed (the list opens the order by its reference). */
const ORDER_PAGE: Record<string, string> = {
  international: "/orders/international",
  express: "/orders/express",
  shop: "/orders/ecommerce",
  equipment: "/orders/equipment-support",
};

export function orderHref(o: { id: number; reference: string; order_type: string }) {
  return `${ORDER_PAGE[o.order_type] ?? "/orders"}?search=${encodeURIComponent(o.reference)}&open=${o.id}`;
}

function HistoryDialog({ order, onClose }: { order: CancelledOrder; onClose: () => void }) {
  const history = useQuery({ queryKey: orderKeys.sub("cancelled", order.id, "history"), queryFn: () => cancelledApi.history(order.id) });
  return (
    <Modal open onClose={onClose} title={`History — ${order.reference}`} size="xl">
      {history.isError ? (
        <ErrorState message={(history.error as Error).message} onRetry={() => history.refetch()} />
      ) : (
        <StatusHistoryList entries={history.data} loading={history.isPending} />
      )}
    </Modal>
  );
}

function ResubmitDialog({ order, onClose }: { order: CancelledOrder; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const resubmit = useOrderMutation(() => cancelledApi.resubmit(order.id, note.trim()), {
    success: (r) => `${order.reference} resubmitted as ${r.new_order.reference}`,
    onSuccess: (r) => {
      onClose();
      router.push(orderHref(r.new_order));
    },
  });
  const paid = Number(order.payment.paid) > 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Resubmit ${order.reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={() => resubmit.mutate(undefined)} loading={resubmit.isPending}>
            <RotateCcw className="size-4" /> Create new order
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-gray-700">
        <p>
          A new {order.order_type_display} order is created for <strong>{order.customer.full_name}</strong> with the same items,
          price and details. It starts again from the first step; {order.reference} stays cancelled with its history and links to
          the new order.
        </p>
        {paid && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            {formatTSh(order.payment.paid)} was paid on {order.reference}. Payments stay on the cancelled order — move or refund
            them in Finance.
          </p>
        )}
        <Field label="Note (optional)" htmlFor="resubmit-note" hint="Why it is being resubmitted (kept in both histories)">
          <Textarea id="resubmit-note" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function CancelledOrdersView() {
  const meta = pageMeta["/orders/cancelled"];
  const { canEdit } = useOrderAccess();
  const [f, setF] = useUrlFilters({ search: "", order_type: "all", resubmitted: "all", page: "1" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);
  const [history, setHistory] = useState<CancelledOrder | null>(null);
  const [resubmitting, setResubmitting] = useState<CancelledOrder | null>(null);

  const query = {
    search: f.search,
    order_type: f.order_type === "all" ? undefined : f.order_type,
    resubmitted: f.resubmitted === "all" ? undefined : f.resubmitted,
    page: Number(f.page),
    page_size: 20,
  };
  const list = useQuery({
    queryKey: orderKeys.list("cancelled", query),
    queryFn: ({ signal }) => cancelledApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const filtered = Boolean(f.search || f.order_type !== "all" || f.resubmitted !== "all");

  return (
    <PageContainer>
      <PageHeader title={meta.title} description={meta.description} />

      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <SearchInput placeholder="Search by order, customer or reason..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search cancelled orders" />
          <div className="flex gap-3 flex-wrap">
            <Select className={select} aria-label="Filter by order type" value={f.order_type} onChange={(e) => setF({ order_type: e.target.value, page: "1" })}>
              <option value="all">All Order Types</option>
              <option value="international">International</option>
              <option value="express">Express Delivery</option>
              <option value="shop">E-commerce Shop</option>
              <option value="equipment">Equipment Support</option>
            </Select>
            <Select className={select} aria-label="Filter by resubmission" value={f.resubmitted} onChange={(e) => setF({ resubmitted: e.target.value, page: "1" })}>
              <option value="all">All</option>
              <option value="false">Not resubmitted</option>
              <option value="true">Resubmitted</option>
            </Select>
          </div>
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState icon={Ban} title="No cancelled orders" description={filtered ? "Try adjusting your filters or search terms" : "Orders cancelled in any module appear here with their reason."} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Order", "Customer", "Items", "Amount", "Cancelled", "Reason", "Resubmitted", "Actions"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.isPending
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 rounded bg-gray-200 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors align-top">
                        <td className="px-6 py-4">
                          <Link href={orderHref(o)} className="font-semibold text-gray-900 hover:text-blue-600 hover:underline whitespace-nowrap">
                            {o.reference}
                          </Link>
                          <div className="mt-1">
                            <Badge tone="gray" square>
                              {o.order_type_display}
                            </Badge>
                          </div>
                          {o.resubmitted_from && (
                            <div className="text-xs text-gray-500 mt-1">
                              From{" "}
                              <Link href={orderHref(o.resubmitted_from)} className="text-blue-600 hover:underline">
                                {o.resubmitted_from.reference}
                              </Link>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-gray-900 whitespace-nowrap">
                            <User className="size-4 text-gray-400" />
                            {o.customer.full_name}
                          </div>
                          <div className="text-xs text-gray-500">{o.customer.phone}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900 max-w-xs" title={o.item_details}>
                            {o.item_details}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-semibold text-gray-900">{formatTSh(o.total_amount)}</div>
                          {Number(o.payment.paid) > 0 && <div className="text-xs text-amber-700">Paid {formatTSh(o.payment.paid)}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm whitespace-nowrap">
                          <div className="text-gray-900">{formatDateTime(o.cancelled_at)}</div>
                          <div className="text-xs text-gray-500">{o.cancelled_by?.full_name ?? "System / customer"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-800 max-w-sm whitespace-pre-line">
                            {o.cancellation_reason || <span className="text-gray-400">No reason recorded</span>}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {o.resubmitted_as ? (
                            <Link href={orderHref(o.resubmitted_as)} className="text-sm font-medium text-blue-600 hover:underline">
                              {o.resubmitted_as.reference}
                              <span className="block text-xs font-normal text-gray-500">{o.resubmitted_as.status_display}</span>
                            </Link>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-2">
                            <button type="button" onClick={() => setHistory(o)} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900 whitespace-nowrap">
                              <History className="size-4" /> History
                            </button>
                            {canEdit && o.can_resubmit && (
                              <button type="button" onClick={() => setResubmitting(o)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">
                                <RotateCcw className="size-4" /> Resubmit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setF({ page: String(p) })} disabled={list.isFetching} />
          )}
        </Card>
      )}

      {history && <HistoryDialog order={history} onClose={() => setHistory(null)} />}
      {resubmitting && <ResubmitDialog order={resubmitting} onClose={() => setResubmitting(null)} />}
    </PageContainer>
  );
}
