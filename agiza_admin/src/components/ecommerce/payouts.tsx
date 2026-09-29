"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Info, Wallet } from "lucide-react";
import { useState } from "react";

import { FormAlert, fromLocalInput, mergedErrors } from "@/components/deliveries/form-helpers";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { can, useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { catalogKeys } from "@/lib/api/services/catalog";
import { PAYOUT_METHODS, marketplaceApi, marketplaceKeys, type PayoutMethod } from "@/lib/api/services/marketplace";
import { formatDateTime, formatTSh } from "@/lib/format";

/** Payouts are a Finance action (Django: Finance edit). */
export function useCanRecordPayout() {
  const { data: me } = useMe();
  return can(me, "finance", "edit");
}

/**
 * Record a transfer made outside the system. The amount is not typed in: the
 * server settles everything currently payable to the vendor.
 */
export function PayoutModal({
  vendor,
  payable,
  payoutAccount,
  onClose,
}: {
  vendor: { id: number; name: string };
  payable: string;
  /** e.g. "M-Pesa · 0712 345 678 · Jane Doe", when known. */
  payoutAccount?: string;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PayoutMethod>("mobile_money");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);

  const record = useApiMutation(
    () =>
      marketplaceApi.payouts.create({
        vendor: vendor.id,
        method,
        transaction_reference: reference.trim(),
        paid_at: fromLocalInput(paidAt),
        notes: notes.trim(),
      }),
    {
      invalidate: [marketplaceKeys.all, catalogKeys.vendors, ["finance"]],
      success: (p) => `Payout ${p.reference} of ${formatTSh(p.amount)} recorded for ${p.vendor.name}`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const fe = mergedErrors(error, {});

  return (
    <Modal
      open
      onClose={() => !record.isPending && onClose()}
      title={
        <span className="block">
          Record Payout
          <span className="block text-sm font-normal text-gray-600 mt-1">{vendor.name}</span>
        </span>
      }
      size="lg"
      footer={
        <>
          <Button className="flex-1" size="lg" loading={record.isPending} onClick={() => record.mutate(undefined)}>
            Record Payout
          </Button>
          <Button variant="muted" size="lg" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">Payable now</p>
          <p className="text-2xl font-bold text-blue-900">{formatTSh(payable)}</p>
          <p className="text-xs text-blue-800 mt-2 flex items-start gap-1.5">
            <Info className="size-3.5 mt-0.5 flex-shrink-0" />
            The payout covers all of this vendor&apos;s payable earnings (delivered and fully paid orders). AGIZA calculates the amount — record the
            transfer after you have made it.
          </p>
          {payoutAccount && <p className="text-sm text-blue-900 mt-2">Pay to: <span className="font-medium">{payoutAccount}</span></p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Method" required htmlFor="po-method" error={fe.method}>
            <Select id="po-method" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)}>
              {PAYOUT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid on" htmlFor="po-paid" error={fe.paid_at} hint="Leave empty for now">
            <Input id="po-paid" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Transaction reference" htmlFor="po-ref" error={fe.transaction_reference} hint="Mobile money or bank transaction ID">
          <Input id="po-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder="e.g. QK7Z3XY12" />
        </Field>
        <Field label="Notes" htmlFor="po-notes" error={fe.notes}>
          <Textarea id="po-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["method", "paid_at", "transaction_reference", "notes"]} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ history table */

/** Payout history (all vendors, or one when `vendorId` is given). */
export function PayoutsTable({ vendorId, pageSize = 10 }: { vendorId?: number; pageSize?: number }) {
  const [page, setPage] = useState(1);
  const query = { vendor: vendorId, page, page_size: pageSize };
  const list = useQuery({
    queryKey: marketplaceKeys.payouts(query),
    queryFn: ({ signal }) => marketplaceApi.payouts.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const headers = [...(vendorId ? [] : ["Vendor"]), "Payout", "Amount", "Method", "Transaction Ref", "Orders", "Paid On", "Recorded By"];

  if (list.isError && !list.data) {
    const forbidden = list.error instanceof ApiError && list.error.status === 403;
    return forbidden ? (
      <p className="px-6 py-8 text-sm text-gray-500 text-center">You don&apos;t have access to payout records.</p>
    ) : (
      <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />
    );
  }
  if (!list.isPending && rows.length === 0) {
    return <EmptyState bare icon={Wallet} title="No payouts yet" description="Payouts recorded for vendors appear here." />;
  }
  return (
    <>
      <Table>
        <THead>
          {headers.map((h) => (
            <Th key={h}>{h}</Th>
          ))}
        </THead>
        <TBody>
          {list.isPending ? (
            <TableSkeletonRows rows={3} columns={headers.length} />
          ) : (
            rows.map((p) => (
              <Tr key={p.id}>
                {!vendorId && <Td className="font-medium text-gray-900 whitespace-nowrap">{p.vendor.name}</Td>}
                <Td>
                  <div className="font-mono text-sm text-gray-900 whitespace-nowrap">{p.reference}</div>
                  {p.notes && (
                    <div className="text-xs text-gray-500 max-w-56 line-clamp-2" title={p.notes}>
                      {p.notes}
                    </div>
                  )}
                </Td>
                <Td className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(p.amount)}</Td>
                <Td className="text-sm text-gray-700 whitespace-nowrap">{p.method_display}</Td>
                <Td className="text-sm text-gray-700 font-mono">{p.transaction_reference || "—"}</Td>
                <Td className="text-sm text-gray-700">{p.orders ?? "—"}</Td>
                <Td className="text-sm text-gray-700 whitespace-nowrap">{formatDateTime(p.paid_at)}</Td>
                <Td className="text-sm text-gray-700 whitespace-nowrap">{p.recorded_by ?? "—"}</Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
      {list.data && list.data.total_pages > 1 && (
        <Pagination
          page={list.data.page}
          pageSize={list.data.page_size}
          count={list.data.count}
          totalPages={list.data.total_pages}
          onPageChange={setPage}
          disabled={list.isFetching}
        />
      )}
    </>
  );
}
