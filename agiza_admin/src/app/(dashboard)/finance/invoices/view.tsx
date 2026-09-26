"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { FinanceShell } from "@/components/finance/finance-shell";
import { InvoiceCreateModal } from "@/components/finance/invoice-create-modal";
import { InvoiceDetailModal, usePdfDownload } from "@/components/finance/invoice-detail-modal";
import { InvoiceStatusBadge, formatDay, th, todayInput } from "@/components/finance/shared";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TableSkeletonRows } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys } from "@/lib/api/services/finance";
import { formatTSh } from "@/lib/format";

export function InvoicesView() {
  const { data: me } = useMe();
  const canEdit = can(me, "finance", "edit");
  const [f, setF] = useUrlFilters({ search: "", status: "all", source: "all", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);
  const [creating, setCreating] = useState(false);
  const { download, pendingId } = usePdfDownload();

  const query = { search: f.search, status: f.status, source: f.source, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: financeKeys.invoices(query),
    queryFn: ({ signal }) => financeApi.invoices.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const openId = f.open ? Number(f.open) : null;

  return (
    <FinanceShell active="invoices">
      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Invoice Management</h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Plus className="size-5" />
                  Create New Invoice
                </button>
              )}
            </div>
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
              <SearchInput placeholder="Search invoices, customers, orders..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search invoices" />
              <div className="flex gap-3 flex-wrap">
                <Select className="w-auto" aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value })}>
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="void">Void</option>
                </Select>
                <Select className="w-auto" aria-label="Filter by source" value={f.source} onChange={(e) => setF({ source: e.target.value })}>
                  <option value="all">All Sources</option>
                  <option value="quote">From Quotation</option>
                  <option value="order">From Order</option>
                  <option value="manual">New Invoice</option>
                </Select>
              </div>
            </div>
          </div>

          {list.isError && !list.data ? (
            <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />
          ) : !list.isPending && rows.length === 0 ? (
            <EmptyState
              bare
              icon={FileText}
              title="No invoices found"
              description={f.search || f.status !== "all" || f.source !== "all" ? "Try adjusting your filters or search terms" : "Create the first invoice from a quotation, an order, or from scratch."}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-y border-gray-200">
                    <tr>
                      {["Invoice ID", "Customer", "Quote/Order ID", "Amount", "Status", "Due Date", "Actions"].map((h) => (
                        <th key={h} scope="col" className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {list.isPending ? (
                      <TableSkeletonRows columns={7} />
                    ) : (
                      rows.map((inv) => {
                        const overdue = inv.due_date && (inv.status === "draft" || inv.status === "sent") && inv.due_date < todayInput();
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">{inv.reference}</td>
                            <td className="px-6 py-4 text-gray-900">{inv.customer.full_name}</td>
                            <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{inv.linked?.reference ?? "—"}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-semibold text-gray-900">{formatTSh(inv.totals.total)}</div>
                              {inv.status !== "void" && Number(inv.totals.balance) > 0 && Number(inv.totals.paid) > 0 && (
                                <div className="text-xs text-red-600">Balance {formatTSh(inv.totals.balance)}</div>
                              )}
                            </td>
                            <td className="px-6 py-4"><InvoiceStatusBadge status={inv.status} /></td>
                            <td className={`px-6 py-4 whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-gray-900"}`}>
                              {formatDay(inv.due_date)}
                              {overdue && <div className="text-xs">Overdue</div>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button type="button" onClick={() => setF({ open: String(inv.id), page: f.page })} className="text-blue-600 hover:text-blue-800 font-medium text-sm mr-3">
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => download(inv)}
                                disabled={pendingId === inv.id}
                                className="text-gray-600 hover:text-gray-800 font-medium text-sm inline-flex items-center gap-1 disabled:opacity-60"
                                aria-label={`Download ${inv.reference} as PDF`}
                              >
                                {pendingId === inv.id && <Loader2 className="size-3 animate-spin" />}
                                Download
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {list.data && list.data.total_pages > 1 && (
                <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setF({ page: String(p) })} disabled={list.isFetching} />
              )}
            </>
          )}
        </Card>
      </div>

      <InvoiceCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(inv) => {
          setCreating(false);
          setF({ open: String(inv.id) });
        }}
      />
      {openId && <InvoiceDetailModal invoiceId={openId} canEdit={canEdit} onClose={() => setF({ open: "", page: f.page })} />}
    </FinanceShell>
  );
}
