"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Clock, DollarSign, ShoppingCart, Trash2, Truck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { FlagBadges, FlagButton } from "@/components/orders/flags";
import { ExceptionBadge, ProcurementOriginBadge, ProcurementStatusBadge } from "@/components/procurement/badges";
import { ProcurementDetailsModal } from "@/components/procurement/details-modal";
import { SuppliersModal } from "@/components/procurement/suppliers-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, SearchInput, Select, Textarea } from "@/components/ui/form";
import { PhotoThumb } from "@/components/ui/photo-viewer";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import { PROCUREMENT_ORIGINS, procurementApi, procurementKeys } from "@/lib/api/services/procurement";
import { formatDate, formatTSh } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

const select = "w-auto bg-white";
const STATUS_OPTIONS: [string, string][] = [
  ["pending_sourcing", "Pending Sourcing"],
  ["supplier_selected", "Supplier Selected"],
  ["paid", "Paid"],
  ["supplier_shipped", "Supplier Shipped"],
  ["supplier_cancelled", "Supplier Canceled"],
  ["received_at_cargo", "Received at Cargo"],
];
const COLUMNS = ["Order ID", "Photos", "Item/Summary", "Origin", "Supplier", "Tracking #", "Status", "Assigned Operator", "Costs", "Last Update", "Exception Flag", "Expected to Cargo"];

/** Design total value: "12.3M". */
function millions(value: string | undefined): string {
  return `${(Number(value ?? 0) / 1_000_000).toFixed(1)}M`;
}

export function ProcurementView() {
  const meta = pageMeta["/procurement"];
  const [f, setF] = useUrlFilters({ search: "", origin: "all", status: "all", operator: "all", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  const query = { search: f.search, origin: f.origin, status: f.status, operator: f.operator, page: Number(f.page), page_size: 20 };
  const list = useQuery({ queryKey: procurementKeys.list(query), queryFn: ({ signal }) => procurementApi.list(query, signal), placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: procurementKeys.stats, queryFn: procurementApi.stats });
  const operators = useQuery({ queryKey: procurementKeys.operators, queryFn: procurementApi.operators });
  const openId = f.open ? Number(f.open) : null;
  const openProc = useQuery({ queryKey: procurementKeys.one(openId ?? 0), queryFn: () => procurementApi.get(openId!), enabled: Boolean(openId) });
  const rows = list.data?.results ?? [];
  const s = stats.data;

  // Bulk cancel (Procurement managers): the selected orders move to Cancelled Orders with the reason.
  // The selection is kept per page and cleared when the list changes.
  const { data: me } = useMe();
  const canDelete = can(me, "procurement", "manage");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const listKey = JSON.stringify(query);
  useEffect(() => setSelected(new Set()), [listKey]);
  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((p) => p.id)));
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => procurementApi.bulkCancel([...selected], reason.trim()),
    onSuccess: (res) => {
      setConfirming(false);
      setReason("");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: procurementKeys.all });
      qc.invalidateQueries({ queryKey: ["orders"] });
      const n = res.cancelled.length;
      if (n) toast.success(`${n} order${n === 1 ? "" : "s"} moved to Cancelled Orders`);
      if (res.skipped.length) {
        toast.error(`${res.skipped.length} not cancelled`, {
          description: res.skipped.map((x) => `${x.reference}: ${x.reason}`).join("\n"),
          duration: 12000,
        });
      }
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <Button variant="outline" onClick={() => setSuppliersOpen(true)}>
            <Building2 className="size-4" /> Suppliers
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
        <StatCard label="Total Orders" value={s?.total} icon={ShoppingCart} tone="blue" loading={!s} />
        <StatCard label="Pending Sourcing" value={s?.pending_sourcing} icon={Clock} tone="yellow" loading={!s} />
        <StatCard label="Paid" value={s?.paid} icon={CheckCircle2} tone="green" loading={!s} />
        <StatCard label="Supplier Shipped" value={s?.shipped} icon={Truck} tone="blue" loading={!s} />
        <StatCard label="At Cargo" value={s?.received_at_cargo} icon={ShoppingCart} tone="purple" loading={!s} />
        <StatCard label="Total Value" value={millions(s?.total_value)} icon={DollarSign} tone="indigo" loading={!s} compactValue />
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <SearchInput placeholder="Search by Order ID, Item, or Supplier..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search procurement orders" />
          <div className="flex gap-3 flex-wrap">
            <Select className={select} aria-label="Filter by origin" value={f.origin} onChange={(e) => setF({ origin: e.target.value })}>
              <option value="all">All Origins</option>
              {PROCUREMENT_ORIGINS.map(([iso, label]) => <option key={iso} value={iso}>{label}</option>)}
            </Select>
            <Select className={select} aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value })}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Select className={select} aria-label="Filter by operator" value={f.operator} onChange={(e) => setF({ operator: e.target.value })}>
              <option value="all">All Operators</option>
              {operators.data?.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No procurement orders found" description="Try adjusting your filters" />
      ) : (
        <Card className="overflow-hidden">
          {canDelete && selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 px-6 py-3 bg-red-50 border-b border-red-100">
              <span className="text-sm font-medium text-gray-900">{selected.size} selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="muted" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
                  <Trash2 className="size-4" /> Delete selected
                </Button>
              </div>
            </div>
          )}
          <Table>
            <THead>
              {canDelete && (
                <Th className="w-10">
                  <Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} label="Select all on this page" />
                </Th>
              )}
              {COLUMNS.map((h) => <Th key={h}>{h}</Th>)}
            </THead>
            <TBody>
              {list.isPending ? (
                <TableSkeletonRows columns={COLUMNS.length + (canDelete ? 1 : 0)} />
              ) : (
                rows.map((p) => (
                  <Tr key={p.id} className={selected.has(p.id) ? "bg-blue-50/60" : undefined}>
                    {canDelete && (
                      <Td className="w-10">
                        <Checkbox checked={selected.has(p.id)} onChange={() => toggle(p.id)} label={`Select ${p.order.reference}`} />
                      </Td>
                    )}
                    <Td>
                      <button
                        type="button"
                        onClick={() => setF({ open: String(p.id), page: f.page })}
                        className="font-semibold text-gray-900 hover:text-blue-600 hover:underline whitespace-nowrap text-left"
                        title="View procurement details"
                      >
                        {p.order.reference}
                      </button>
                      <div className="text-xs text-gray-500">{formatDate(p.created_at)}</div>
                    </Td>
                    <Td><PhotoThumb urls={(p.photos ?? []).map((ph) => fileSrc(ph.url))} alt={p.order.item_details} /></Td>
                    <Td><div className="text-gray-900 max-w-xs">{p.order.item_details}</div></Td>
                    <Td><ProcurementOriginBadge iso2={p.origin.iso2} name={p.origin.name} /></Td>
                    <Td className="text-gray-900">{p.supplier?.name ?? <span className="text-gray-400">—</span>}</Td>
                    <Td>
                      {p.supplier_tracking_number ? (
                        <div className="font-mono text-sm text-gray-900 whitespace-nowrap">{p.supplier_tracking_number}</div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </Td>
                    <Td><ProcurementStatusBadge status={p.status} label={p.status_display} /></Td>
                    <Td>
                      <div className="flex items-center gap-2 text-gray-900">
                        <User className="size-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm whitespace-nowrap">{p.operator?.full_name ?? "Unassigned"}</span>
                      </div>
                    </Td>
                    <Td><div className="font-semibold text-gray-900 whitespace-nowrap">{p.item_cost ? formatTSh(p.item_cost) : <span className="text-gray-400 font-normal">—</span>}</div></Td>
                    <Td className="text-sm text-gray-900">{formatDate(p.updated_at)}</Td>
                    <Td>
                      <div className="space-y-1">
                        <ExceptionBadge flag={p.exception_flag} />
                        <FlagBadges flags={p.order.flags} />
                        <FlagButton orderId={p.order.id} reference={p.order.reference} department="procurement" />
                      </div>
                    </Td>
                    <Td>
                      {p.expected_at_cargo ? <div className="text-sm text-gray-900">{formatDate(p.expected_at_cargo)}</div> : <span className="text-gray-400">—</span>}
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(pg) => setF({ page: String(pg) })} disabled={list.isFetching} />
          )}
        </Card>
      )}

      {openId && openProc.isError && (
        <div className="fixed bottom-4 right-4 z-40">
          <Card className="p-4 flex items-center gap-3">
            <span className="text-sm text-red-600">{errorText(openProc.error)}</span>
            <Button size="sm" variant="muted" onClick={() => setF({ open: "", page: f.page })}>Dismiss</Button>
          </Card>
        </div>
      )}
      {openProc.data && openId && <ProcurementDetailsModal proc={openProc.data} onClose={() => setF({ open: "", page: f.page })} />}
      <SuppliersModal open={suppliersOpen} onClose={() => setSuppliersOpen(false)} />
      <ConfirmDialog
        open={confirming}
        title={`Delete ${selected.size} order${selected.size === 1 ? "" : "s"}?`}
        tone="danger"
        confirmLabel="Move to Cancelled Orders"
        pending={remove.isPending}
        onConfirm={() => (reason.trim() ? remove.mutate() : toast.error("Give the reason for cancelling."))}
        onClose={() => setConfirming(false)}
        message={
          <p className="text-sm">
            The selected orders are cancelled and moved to <strong>Cancelled Orders</strong>, with this reason.
            Their procurement, cargo and delivery records are closed. You can resubmit an order from there.
          </p>
        }
      >
        <div className="mt-4">
          <Field label="Reason (required)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Duplicate / test orders" />
          </Field>
        </div>
      </ConfirmDialog>
    </PageContainer>
  );
}
