"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, CreditCard, Edit, Printer, Receipt, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { FinanceShell } from "@/components/finance/finance-shell";
import { CostsDialog, RecordPaymentDialog, WalletPayDialog } from "@/components/finance/payment-dialogs";
import { ReceiptModal } from "@/components/finance/receipt-modal";
import { KINDS, METHODS, ORDER_TYPES, th } from "@/components/finance/shared";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TableSkeletonRows } from "@/components/ui/table";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys, type OrderPayment } from "@/lib/api/services/finance";
import { formatDate, formatDateTime, formatTSh } from "@/lib/format";

type View = "orders" | "ledger";
type Dialog = { mode: "costs" | "record" | "wallet"; order: OrderPayment } | null;

const DEFAULTS = { view: "orders", search: "", order_type: "all", payment: "all", method: "all", kind: "all", from: "", to: "", page: "1", receipt: "" };

export function PaymentsView() {
  const { data: me } = useMe();
  const canEdit = can(me, "finance", "edit");
  const [f, setF] = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const view = f.view as View;

  const switchView = (v: View) => {
    setSearch("");
    setF({ view: v, search: "", order_type: "all", payment: "all", method: "all", kind: "all", from: "", to: "" });
  };

  const receiptId = f.receipt ? Number(f.receipt) : null;

  return (
    <FinanceShell active="payments">
      <Card>
        <div className="px-6 pt-4">
          <UnderlineTabs<View>
            value={view}
            onChange={switchView}
            options={[
              { value: "orders", label: <><Receipt className="size-4" />Order Payments</> },
              { value: "ledger", label: <><BookOpen className="size-4" />Payments Ledger</> },
            ]}
          />
        </div>
        <div className="p-6 border-b border-gray-200 flex flex-col lg:flex-row gap-4 lg:items-center">
          <SearchInput
            placeholder={view === "orders" ? "Search orders..." : "Search by reference, order or customer..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={view === "orders" ? "Search orders" : "Search payments"}
          />
          {view === "orders" ? (
            <div className="flex gap-3 flex-wrap">
              <Select className="w-auto" aria-label="Filter by order type" value={f.order_type} onChange={(e) => setF({ order_type: e.target.value })}>
                <option value="all">All Order Types</option>
                {ORDER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <Select className="w-auto" aria-label="Filter by payment" value={f.payment} onChange={(e) => setF({ payment: e.target.value })}>
                <option value="all">All Payments</option>
                <option value="due">Balance Due</option>
                <option value="paid">Paid in Full</option>
              </Select>
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap items-center">
              <Select className="w-auto" aria-label="Filter by method" value={f.method} onChange={(e) => setF({ method: e.target.value })}>
                <option value="all">All Methods</option>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                <option value="wallet">Customer Wallet</option>
              </Select>
              <Select className="w-auto" aria-label="Filter by payment type" value={f.kind} onChange={(e) => setF({ kind: e.target.value })}>
                <option value="all">All Types</option>
                {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                <option value="refund">Refund</option>
              </Select>
              <Input type="date" className="w-auto" aria-label="Paid from" value={f.from} max={f.to || undefined} onChange={(e) => setF({ from: e.target.value })} />
              <span className="text-gray-500 text-sm">to</span>
              <Input type="date" className="w-auto" aria-label="Paid to" value={f.to} min={f.from || undefined} onChange={(e) => setF({ to: e.target.value })} />
            </div>
          )}
        </div>

        {view === "orders" ? (
          <OrdersTable f={f} setF={setF} canEdit={canEdit} onDialog={setDialog} />
        ) : (
          <LedgerTable f={f} setF={setF} />
        )}
      </Card>

      {receiptId && <ReceiptModal orderId={receiptId} onClose={() => setF({ receipt: "" })} />}
      <CostsDialog order={dialog?.mode === "costs" ? dialog.order : null} onClose={() => setDialog(null)} />
      <RecordPaymentDialog order={dialog?.mode === "record" ? dialog.order : null} onClose={() => setDialog(null)} />
      <WalletPayDialog order={dialog?.mode === "wallet" ? dialog.order : null} onClose={() => setDialog(null)} />
    </FinanceShell>
  );
}

type Filters = typeof DEFAULTS;
type SetFilters = (patch: Partial<Filters>) => void;

function OrdersTable({ f, setF, canEdit, onDialog }: { f: Filters; setF: SetFilters; canEdit: boolean; onDialog: (d: Dialog) => void }) {
  const query = { search: f.search, order_type: f.order_type, payment: f.payment, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: financeKeys.orderPayments(query),
    queryFn: ({ signal }) => financeApi.orderPayments.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];

  if (list.isError && !list.data) return <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />;
  if (!list.isPending && rows.length === 0) {
    return <EmptyState bare icon={Receipt} title="No orders found" description="Try adjusting your filters or search terms" />;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Order ID", "Item Name", "Total Amount", "Paid", "Purchase Cost", "Shipping Cost", "Profit", "Actions"].map((h) => (
                <th key={h} scope="col" className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {list.isPending ? (
              <TableSkeletonRows columns={8} />
            ) : (
              rows.map((o) => {
                const fg = o.figures;
                const profit = fg.profit === null ? null : Number(fg.profit);
                const due = fg.due === null ? 0 : Number(fg.due);
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 whitespace-nowrap">{o.reference}</div>
                      <div className="text-xs text-gray-500">{formatDate(o.created_at)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900 max-w-xs truncate" title={o.item_details}>{o.item_details || o.order_type_display}</div>
                      <div className="text-xs text-gray-500">{o.customer.full_name}</div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                      {fg.total === null ? <span className="text-gray-400 font-normal">Not priced</span> : formatTSh(fg.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold text-green-600">{formatTSh(fg.paid)}</div>
                      {due > 0 && <div className="text-xs text-red-600">Due {formatTSh(fg.due)}</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-900 whitespace-nowrap">
                      {formatTSh(fg.purchase_cost)}
                      {fg.purchase_cost_set && <div className="text-xs text-gray-500">Manual</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-900 whitespace-nowrap">
                      {formatTSh(fg.shipping_cost)}
                      {fg.shipping_cost_set && <div className="text-xs text-gray-500">Manual</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${profit !== null && profit < 0 ? "text-red-600" : "text-green-600"}`}>{formatTSh(fg.profit)}</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onDialog({ mode: "costs", order: o })}
                            className="text-gray-400 hover:text-gray-600"
                            aria-label={`Edit costs of ${o.reference}`}
                            title="Edit purchase & shipping cost"
                          >
                            <Edit className="size-4" />
                          </button>
                        )}
                      </div>
                      {fg.margin !== null && <div className="text-xs text-gray-500">{Number(fg.margin).toFixed(1)}%</div>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setF({ receipt: String(o.id), page: f.page })}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 whitespace-nowrap"
                        >
                          <Printer className="size-4" />
                          Print Receipt
                        </button>
                        {canEdit && due > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => onDialog({ mode: "record", order: o })}
                              className="text-green-600 hover:text-green-800 font-medium text-sm flex items-center gap-1 whitespace-nowrap"
                            >
                              <CreditCard className="size-4" />
                              Record Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => onDialog({ mode: "wallet", order: o })}
                              className="text-purple-600 hover:text-purple-800 font-medium text-sm flex items-center gap-1 whitespace-nowrap"
                            >
                              <Wallet className="size-4" />
                              Pay from Wallet
                            </button>
                          </>
                        )}
                      </div>
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
  );
}

function LedgerTable({ f, setF }: { f: Filters; setF: SetFilters }) {
  const query = { search: f.search, method: f.method, kind: f.kind, paid_from: f.from, paid_to: f.to, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: financeKeys.ledger(query),
    queryFn: ({ signal }) => financeApi.payments.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];

  if (list.isError && !list.data) return <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />;
  if (!list.isPending && rows.length === 0) {
    return <EmptyState bare icon={BookOpen} title="No payments found" description="Try adjusting your filters or search terms" />;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["Date", "Order ID", "Customer", "Amount", "Method", "Type", "Reference", "Recorded By", "Actions"].map((h) => (
                <th key={h} scope="col" className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {list.isPending ? (
              <TableSkeletonRows columns={9} />
            ) : (
              rows.map((p) => {
                const refund = p.kind === "refund";
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
                    <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">{p.order.reference}</td>
                    <td className="px-6 py-4 text-gray-900">{p.order.customer}</td>
                    <td className={`px-6 py-4 font-semibold whitespace-nowrap ${refund ? "text-red-600" : "text-green-600"}`}>
                      {refund ? "−" : ""}
                      {formatTSh(p.amount)}
                    </td>
                    <td className="px-6 py-4 text-gray-900 whitespace-nowrap">{p.method_display}</td>
                    <td className="px-6 py-4">
                      <Badge tone={refund ? "red" : p.kind === "installment" ? "purple" : p.kind === "advance" ? "blue" : "green"}>{p.kind_display}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-700 text-sm">{p.reference || "—"}</td>
                    <td className="px-6 py-4 text-gray-700 text-sm whitespace-nowrap">{p.recorded_by?.full_name ?? "—"}</td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setF({ receipt: String(p.order.id), page: f.page })}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 whitespace-nowrap"
                      >
                        <Printer className="size-4" />
                        Receipt
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
  );
}
