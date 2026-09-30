"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, DollarSign, Package, Plus, RotateCcw, User } from "lucide-react";
import React, { useEffect, useState } from "react";

import {
  CustomerRequestTag,
  ImpactBadge,
  OwnerBadge,
  ReturnExceptionBadge,
  ReturnStatusBadge,
  ReturnTypeBadge,
  useReturnAccess,
} from "@/components/returns/badges";
import { NewReturnDialog } from "@/components/returns/new-return-dialog";
import { ReturnRowDetails } from "@/components/returns/row-details";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { returnKeys, returnsApi, type ReturnRequest } from "@/lib/api/services/returns";
import { formatTSh, timeAgo, titleCase } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";
const select = "w-auto bg-white";
const COLUMNS = [
  "Return ID",
  "Order ID",
  "Customer",
  "Return Type",
  "Return Status",
  "Current Owner",
  "Assigned Handler",
  "Reason Code",
  "Last Update",
  "Financial Impact",
  "Exception Flag",
  "Actions",
];
type Tab = "active" | "completed";
const STATUS_OPTIONS: Record<Tab, [string, string][]> = {
  active: [
    ["initiated", "Initiated"],
    ["in_transit", "In Transit (Return)"],
    ["received", "Received"],
    ["inspected", "Inspected"],
    ["approved", "Approved"],
  ],
  completed: [
    ["rejected", "Rejected"],
    ["closed", "Closed"],
  ],
};

/** Design: "TSh 2.5M" for pending refund totals. */
function compactTSh(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return n >= 1_000_000 ? `TSh ${(n / 1_000_000).toFixed(1)}M` : formatTSh(n);
}

export function ReturnsView() {
  const meta = pageMeta["/returns"];
  const { canEdit } = useReturnAccess();
  const [f, setF] = useUrlFilters({ tab: "active", search: "", owner: "all", status: "all", handler: "all", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced, open: "" });
  }, [debounced, f.search, setF]);

  const tab = (f.tab === "completed" ? "completed" : "active") as Tab;
  const query = { tab, search: f.search, owner: f.owner, status: f.status, handler: f.handler, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: returnKeys.list(query),
    queryFn: ({ signal }) => returnsApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: returnKeys.stats, queryFn: returnsApi.stats });
  const handlers = useQuery({ queryKey: returnKeys.handlers, queryFn: returnsApi.handlers, staleTime: 60_000 });
  const rows = list.data?.results ?? [];
  const expanded = f.open ? Number(f.open) : null;
  const s = stats.data;

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-5" /> New Return
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Active Returns" value={s?.active} icon={RotateCcw} tone="blue" loading={!s} />
        <StatCard label="Completed/Closed" value={s?.completed} icon={Package} tone="green" loading={!s} />
        <StatCard label="Pending Refunds" value={compactTSh(s?.pending_refunds)} icon={DollarSign} tone="red" loading={!s} compactValue />
        <StatCard label="With Exceptions" value={s?.with_exceptions} icon={AlertTriangle} tone="orange" loading={!s} />
      </div>
      {stats.isError && (
        <p className="-mt-6 mb-6 text-sm text-red-600" role="alert">
          Couldn&apos;t load return totals: {errorText(stats.error)}{" "}
          <button type="button" className="font-medium text-blue-600 hover:text-blue-800" onClick={() => stats.refetch()}>
            Retry
          </button>
        </p>
      )}

      <Card className="p-6 mb-6">
        <div className="mb-4">
          <PillTabs<Tab>
            value={tab}
            onChange={(t) => setF({ tab: t, status: "all", open: "" })}
            options={[
              { value: "active", label: `Active Returns (${s?.active ?? "…"})` },
              { value: "completed", label: `Completed/Closed (${s?.completed ?? "…"})` },
            ]}
          />
        </div>
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between pt-4 border-t border-gray-200">
          <SearchInput
            placeholder="Search by Return ID, Order ID, or Customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search returns"
          />
          <div className="flex gap-3 flex-wrap">
            <Select className={select} aria-label="Filter by department" value={f.owner} onChange={(e) => setF({ owner: e.target.value, open: "" })}>
              <option value="all">All Departments</option>
              <option value="delivery">Delivery</option>
              <option value="warehouse">Warehouse</option>
              <option value="support">Support</option>
              <option value="finance">Finance</option>
            </Select>
            <Select className={select} aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value, open: "" })}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS[tab].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Select className={select} aria-label="Filter by handler" value={f.handler} onChange={(e) => setF({ handler: e.target.value, open: "" })}>
              <option value="all">All Handlers</option>
              {handlers.data?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <Card className="p-12 text-center">
          <RotateCcw className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No returns found</p>
          <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {COLUMNS.map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.isPending
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {COLUMNS.map((c) => (
                          <td key={c} className="px-6 py-4">
                            <div className="h-4 rounded bg-gray-200 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((r) => <Row key={r.id} ret={r} open={expanded === r.id} toggle={() => setF({ open: expanded === r.id ? "" : String(r.id) })} />)}
              </tbody>
            </table>
          </div>
          {list.data && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={(p) => setF({ page: String(p), open: "" })}
              disabled={list.isFetching}
            />
          )}
        </Card>
      )}

      <NewReturnDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(r) => setF({ tab: "active", status: "all", owner: "all", handler: "all", search: "", open: String(r.id) })}
      />
    </PageContainer>
  );
}

function Row({ ret: r, open, toggle }: { ret: ReturnRequest; open: boolean; toggle: () => void }) {
  return (
    <React.Fragment>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <div className="font-semibold text-gray-900 whitespace-nowrap">{r.reference}</div>
          {r.requested_by_customer && (
            <div className="mt-1">
              <CustomerRequestTag />
            </div>
          )}
        </td>
        <td className="px-6 py-4">
          <div className="text-gray-900 whitespace-nowrap">{r.order.reference}</div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            <User className="size-4 text-gray-400 flex-shrink-0" />
            <span className="text-gray-900 whitespace-nowrap">{r.customer.full_name}</span>
          </div>
        </td>
        <td className="px-6 py-4">
          <ReturnTypeBadge type={r.return_type} label={r.return_type_display} />
        </td>
        <td className="px-6 py-4">
          <ReturnStatusBadge status={r.status} label={r.status_display} />
        </td>
        <td className="px-6 py-4">
          <OwnerBadge owner={r.owner} label={r.owner_display} />
        </td>
        <td className="px-6 py-4">
          {r.handler ? (
            <div>
              <div className="text-gray-900 font-medium whitespace-nowrap">{r.handler.full_name}</div>
              <div className="text-xs text-gray-500 capitalize">{r.handler.role}</div>
            </div>
          ) : (
            <span className="text-sm text-gray-500 italic">Unassigned</span>
          )}
        </td>
        <td className="px-6 py-4">
          <span className="text-sm text-gray-700 whitespace-nowrap">{r.reason_code_display}</span>
        </td>
        <td className="px-6 py-4">
          <div className="text-sm text-gray-900 whitespace-nowrap">
            {timeAgo(r.last_update.at)} – {titleCase(r.last_update.department)}
          </div>
        </td>
        <td className="px-6 py-4">
          <ImpactBadge impact={r.financial_impact} label={r.financial_impact_display} />
        </td>
        <td className="px-6 py-4">
          <ReturnExceptionBadge flag={r.exception_flag} />
        </td>
        <td className="px-6 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${r.reference}`}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {open ? "Less" : "Details"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={COLUMNS.length} className="px-6 py-4 bg-gray-50">
            <ReturnRowDetails ret={r} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}
