"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Plus, Wallet, XCircle } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { FinanceShell } from "@/components/finance/finance-shell";
import { CreatePlanDialog, DecidePlanDialog } from "@/components/finance/plan-dialogs";
import { PlanStatusBadge, formatDay, th, todayInput } from "@/components/finance/shared";
import { WalletModal } from "@/components/finance/wallet-modal";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TableSkeletonRows } from "@/components/ui/table";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys, type InstallmentPlan, type PlanStatus } from "@/lib/api/services/finance";
import { formatTSh } from "@/lib/format";

const DEFAULTS = { search: "", page: "1", wallet: "", pstatus: "all", psearch: "", ppage: "1" };
type PlanTab = "all" | PlanStatus;

export function WalletsView() {
  const { data: me } = useMe();
  const canEdit = can(me, "finance", "edit");
  const canManage = can(me, "finance", "manage");
  const [f, setF] = useUrlFilters(DEFAULTS);

  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced, ppage: f.ppage });
  }, [debounced, f.search, f.ppage, setF]);

  const query = { search: f.search, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: financeKeys.wallets(query),
    queryFn: ({ signal }) => financeApi.wallets.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const walletId = f.wallet ? Number(f.wallet) : null;

  return (
    <FinanceShell active="wallets">
      <div className="space-y-8">
        <Card>
          <div className="p-6 border-b border-gray-200">
            <SearchInput placeholder="Search customers by name, ID or phone..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search wallets" />
          </div>
          {list.isError && !list.data ? (
            <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />
          ) : !list.isPending && rows.length === 0 ? (
            <EmptyState bare icon={Wallet} title="No customers found" description={f.search ? "Try adjusting your search terms" : "Customers appear here once they have orders or a wallet."} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["Customer", "Wallet Balance", "Total Orders", "Total Paid", "Total Due", "Installments", "Actions"].map((h) => (
                        <th key={h} scope="col" className={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {list.isPending ? (
                      <TableSkeletonRows columns={7} />
                    ) : (
                      rows.map((w) => (
                        <tr
                          key={w.customer.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => setF({ wallet: String(w.customer.id), page: f.page, ppage: f.ppage })}
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{w.customer.full_name}</div>
                            <div className="text-xs text-gray-500">{w.customer.reference}</div>
                          </td>
                          <td className="px-6 py-4 font-semibold text-blue-600 whitespace-nowrap">{formatTSh(w.wallet_balance)}</td>
                          <td className="px-6 py-4 text-gray-900">{w.total_orders}</td>
                          <td className="px-6 py-4 font-semibold text-green-600 whitespace-nowrap">{formatTSh(w.total_paid)}</td>
                          <td className="px-6 py-4 font-semibold text-red-600 whitespace-nowrap">{formatTSh(w.total_due)}</td>
                          <td className="px-6 py-4">
                            {w.installment_plans.length > 0 ? (
                              <div className="space-y-2">
                                {w.installment_plans.map((p) => (
                                  <div key={p.plan_id} className="text-sm">
                                    <div className="font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                                      {p.order}
                                      {p.status === "pending_approval" && <Badge tone="orange">Pending Approval</Badge>}
                                    </div>
                                    {p.next_due ? (
                                      <div className={`text-xs ${p.next_due < todayInput() ? "text-red-600 font-medium" : "text-gray-600"}`}>
                                        Next: {formatTSh(p.next_amount)} on {formatDay(p.next_due)}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-gray-600">Fully paid</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setF({ wallet: String(w.customer.id), page: f.page, ppage: f.ppage });
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium text-sm whitespace-nowrap"
                              aria-label={`Manage wallet of ${w.customer.full_name}`}
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {list.data && list.data.total_pages > 1 && (
                <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setF({ page: String(p), ppage: f.ppage })} disabled={list.isFetching} />
              )}
            </>
          )}
        </Card>

        <PlansSection f={f} setF={setF} canEdit={canEdit} canManage={canManage} />
      </div>

      {walletId && (
        <WalletModal customerId={walletId} canEdit={canEdit} canManage={canManage} onClose={() => setF({ wallet: "", page: f.page, ppage: f.ppage })} />
      )}
    </FinanceShell>
  );
}

type Filters = typeof DEFAULTS;

function PlansSection({ f, setF, canEdit, canManage }: { f: Filters; setF: (p: Partial<Filters>) => void; canEdit: boolean; canManage: boolean }) {
  const [search, setSearch] = useState(f.psearch);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.psearch) setF({ psearch: debounced, ppage: "1", page: f.page });
  }, [debounced, f.psearch, f.page, setF]);
  const [creating, setCreating] = useState(false);
  const [decision, setDecision] = useState<{ plan: InstallmentPlan; approve: boolean } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const query = { status: f.pstatus, search: f.psearch, page: Number(f.ppage), page_size: 10 };
  const plans = useQuery({
    queryKey: financeKeys.plans(query),
    queryFn: ({ signal }) => financeApi.plans.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const pending = useQuery({
    queryKey: financeKeys.plans({ status: "pending_approval", count: true }),
    queryFn: () => financeApi.plans.list({ status: "pending_approval", page_size: 1 }),
  });
  const pendingCount = pending.data?.count;
  const rows = plans.data?.results ?? [];
  const today = todayInput();

  return (
    <Card>
      <div className="p-6 border-b border-gray-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Installment Plans</h2>
            {Boolean(pendingCount) && (
              <p className="text-sm text-orange-700 flex items-center gap-1 mt-1">
                <AlertTriangle className="size-4" />
                {pendingCount} plan{pendingCount === 1 ? "" : "s"} waiting for approval
              </p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <Plus className="size-5" />
              New Installment Plan
            </button>
          )}
        </div>
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <SearchInput placeholder="Search by order or customer..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search installment plans" />
          <PillTabs<PlanTab>
            value={f.pstatus as PlanTab}
            onChange={(pstatus) => setF({ pstatus, ppage: "1", page: f.page })}
            options={[
              { value: "all", label: "All" },
              { value: "pending_approval", label: `Pending Approval${pendingCount !== undefined ? ` (${pendingCount})` : ""}`, activeClass: "bg-orange-600" },
              { value: "active", label: "Active" },
              { value: "completed", label: "Completed" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
        </div>
      </div>

      {plans.isError && !plans.data ? (
        <ErrorState bare message={errorText(plans.error)} onRetry={() => plans.refetch()} />
      ) : !plans.isPending && rows.length === 0 ? (
        <EmptyState bare icon={CalendarClock} title="No installment plans found" description={f.psearch || f.pstatus !== "all" ? "Try adjusting your filters or search terms" : "Split an order's balance into scheduled payments with New Installment Plan."} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th scope="col" className="w-10 px-3" aria-label="Schedule" />
                  {["Order", "Customer", "Total", "Paid", "Next Payment", "Status", "Actions"].map((h) => (
                    <th key={h} scope="col" className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {plans.isPending ? (
                  <TableSkeletonRows columns={8} rows={4} />
                ) : (
                  rows.map((p) => {
                    const paid = p.installments.reduce((s, i) => s + Number(i.paid_amount), 0);
                    const isPending = p.status === "pending_approval";
                    const open = expanded === p.id;
                    const late = p.next_payment && p.next_payment.due_date < today && p.status === "active";
                    return (
                      <Fragment key={p.id}>
                        <tr className={isPending ? "bg-orange-50 hover:bg-orange-100" : "hover:bg-gray-50"}>
                          <td className="px-3 py-4">
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : p.id)}
                              className="p-1 rounded hover:bg-gray-200"
                              aria-expanded={open}
                              aria-label={`${open ? "Hide" : "Show"} schedule for ${p.order.reference}`}
                            >
                              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900 whitespace-nowrap">{p.order.reference}</div>
                            <div className="text-xs text-gray-500">
                              {p.number_of_installments} × every {p.interval_days} days
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-900">{p.customer.full_name}</td>
                          <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">{formatTSh(p.total_amount)}</td>
                          <td className="px-6 py-4 font-semibold text-green-600 whitespace-nowrap">{formatTSh(paid)}</td>
                          <td className={`px-6 py-4 text-sm whitespace-nowrap ${late ? "text-red-600 font-medium" : "text-gray-900"}`}>
                            {p.next_payment ? (
                              <>
                                {formatTSh(p.next_payment.amount)}
                                <div className="text-xs">
                                  on {formatDay(p.next_payment.due_date)}
                                  {late && " · Overdue"}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <PlanStatusBadge status={p.status} label={p.status_display} />
                            {p.decision_note && <div className="text-xs text-gray-500 mt-1 max-w-48 truncate" title={p.decision_note}>{p.decision_note}</div>}
                          </td>
                          <td className="px-6 py-4">
                            {isPending && canManage ? (
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => setDecision({ plan: p, approve: true })}
                                  className="text-green-600 hover:text-green-800 font-medium text-sm flex items-center gap-1"
                                >
                                  <CheckCircle2 className="size-4" /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDecision({ plan: p, approve: false })}
                                  className="text-red-600 hover:text-red-800 font-medium text-sm flex items-center gap-1"
                                >
                                  <XCircle className="size-4" /> Reject
                                </button>
                              </div>
                            ) : isPending ? (
                              <span className="text-xs text-orange-700">Awaiting Finance manager</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-gray-50">
                            <td />
                            <td colSpan={7} className="px-6 py-4">
                              <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {p.installments.map((i) => {
                                  const overdue = i.status !== "paid" && i.due_date < today;
                                  return (
                                    <li key={i.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2">
                                      <span>
                                        <span className="font-medium text-gray-900">#{i.sequence}</span>
                                        <span className={`ml-2 ${overdue ? "text-red-600" : "text-gray-600"}`}>{formatDay(i.due_date)}</span>
                                        <span className="block text-xs text-gray-500">
                                          {formatTSh(i.paid_amount)} / {formatTSh(i.amount)}
                                        </span>
                                      </span>
                                      <Badge tone={i.status === "paid" ? "green" : overdue ? "red" : i.status === "partial" ? "yellow" : "gray"}>
                                        {overdue && i.status !== "partial" ? "Overdue" : i.status_display}
                                      </Badge>
                                    </li>
                                  );
                                })}
                              </ol>
                              {p.notes && <p className="text-sm text-gray-600 mt-3">Notes: {p.notes}</p>}
                              {p.approved_by && (
                                <p className="text-xs text-gray-500 mt-2">
                                  {p.status === "rejected" ? "Rejected" : "Approved"} by {p.approved_by.full_name}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {plans.data && plans.data.total_pages > 1 && (
            <Pagination page={plans.data.page} pageSize={plans.data.page_size} count={plans.data.count} totalPages={plans.data.total_pages} onPageChange={(p) => setF({ ppage: String(p), page: f.page })} disabled={plans.isFetching} />
          )}
        </>
      )}

      <CreatePlanDialog open={creating} onClose={() => setCreating(false)} />
      <DecidePlanDialog plan={decision?.plan ?? null} approve={decision?.approve ?? true} onClose={() => setDecision(null)} />
    </Card>
  );
}
