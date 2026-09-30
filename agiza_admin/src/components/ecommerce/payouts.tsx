"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Info, Layers, RotateCcw, Wallet, XCircle } from "lucide-react";
import { useState } from "react";

import { FormAlert, fromLocalInput, mergedErrors } from "@/components/deliveries/form-helpers";
import { Badge, type BadgeTone } from "@/components/ui/badge";
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
import {
  PAYOUT_METHODS,
  marketplaceApi,
  marketplaceKeys,
  type Payout,
  type PayoutBatchCreated,
  type PayoutMethod,
  type PayoutStatus,
  type VendorEarningsRow,
} from "@/lib/api/services/marketplace";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTSh } from "@/lib/format";

/** Payout changes move vendor balances, settlements and Finance figures. */
const INVALIDATE = [marketplaceKeys.all, catalogKeys.vendors, ["finance"]];

/** Payouts are a Finance action (Django: Finance edit). */
export function useCanRecordPayout() {
  const { data: me } = useMe();
  return can(me, "finance", "edit");
}

/** Manual balance adjustments (Django: Finance manage). */
export function useCanAdjustLedger() {
  const { data: me } = useMe();
  return can(me, "finance", "manage");
}

/* ------------------------------------------------------------------ status */

const PAYOUT_TONE: Record<PayoutStatus, BadgeTone> = {
  processing: "amber",
  paid: "green",
  failed: "red",
  reversed: "gray",
};

export function PayoutStatusBadge({ status, label }: { status: PayoutStatus; label?: string }) {
  return (
    <Badge tone={PAYOUT_TONE[status] ?? "gray"} className={cn(status === "reversed" && "text-red-700")}>
      {label || status}
    </Badge>
  );
}

/* ------------------------------------------------------------ record payout */

/**
 * Record a transfer already made outside the system. The amount is not typed
 * in: the server settles the vendor's whole payable balance. The transfer
 * reference is the proof of payment and is required.
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
  const [local, setLocal] = useState<Record<string, string>>({});

  const record = useApiMutation(
    () =>
      marketplaceApi.payouts.create({
        vendor: vendor.id,
        method,
        record_as_paid: true,
        transaction_reference: reference.trim(),
        paid_at: fromLocalInput(paidAt),
        notes: notes.trim(),
      }),
    {
      invalidate: INVALIDATE,
      success: (p) => `Payout ${p.reference} of ${formatTSh(p.amount)} recorded for ${p.vendor.name}`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const submit = () => {
    if (!reference.trim()) return setLocal({ transaction_reference: "Enter the transfer reference as proof of payment." });
    setLocal({});
    setError(null);
    record.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

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
          <Button className="flex-1" size="lg" loading={record.isPending} onClick={submit}>
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
            The payout covers this vendor&apos;s whole payable balance (earnings from delivered and fully paid orders, less refunds, plus adjustments).
            AGIZA calculates the amount — record the transfer after you have made it.
          </p>
          {payoutAccount && (
            <p className="text-sm text-blue-900 mt-2">
              Pay to: <span className="font-medium">{payoutAccount}</span>
            </p>
          )}
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
        <Field label="Transaction reference" required htmlFor="po-ref" error={fe.transaction_reference} hint="Mobile money or bank transaction ID">
          <Input
            id="po-ref"
            value={reference}
            maxLength={80}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. QK7Z3XY12"
            invalid={Boolean(fe.transaction_reference)}
          />
        </Field>
        <Field label="Notes" htmlFor="po-notes" error={fe.notes}>
          <Textarea id="po-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["method", "paid_at", "transaction_reference", "notes"]} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ payout batch */

/**
 * Prepare a payout batch: one processing payout per vendor with a payable
 * balance (all of them, or the ones ticked). Finance then makes the transfers
 * and marks each payout paid or failed.
 */
export function PayoutBatchModal({ vendors, onClose }: { vendors: VendorEarningsRow[]; onClose: () => void }) {
  /** Vendors a batch can include: a payable balance and no payout already processing. */
  const eligible = vendors.filter((v) => Number(v.payable) > 0 && Number(v.in_payout) <= 0);
  const [mode, setMode] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<PayoutBatchCreated | null>(null);

  const prepare = useApiMutation(
    () => marketplaceApi.batches.create({ ...(mode === "some" ? { vendors: picked } : {}), notes: notes.trim() }),
    {
      invalidate: INVALIDATE,
      success: (b) => `Batch ${b.reference}: ${b.payouts.length} payout(s) ready to process`,
      onSuccess: setCreated,
      onError: setError,
    },
  );
  const submit = () => {
    if (mode === "some" && picked.length === 0) return setLocal({ vendors: "Tick at least one vendor." });
    setLocal({});
    setError(null);
    prepare.mutate(undefined);
  };
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const fe = mergedErrors(error, local);
  const selectedTotal = eligible.filter((v) => mode === "all" || picked.includes(v.vendor.id)).reduce((t, v) => t + Number(v.payable), 0);

  if (created) {
    const total = created.payouts.reduce((t, p) => t + Number(p.amount), 0);
    return (
      <Modal
        open
        onClose={onClose}
        title={`Batch ${created.reference}`}
        size="3xl"
        footer={
          <Button variant="muted" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
            {created.payouts.length} payout(s) totalling <span className="font-semibold">{formatTSh(total)}</span> are now <strong>processing</strong>. Make each
            transfer, then mark the payout paid with its transaction reference (or failed) in Payout History.
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <Table>
              <THead>
                <Th>Vendor</Th>
                <Th>Payout</Th>
                <Th>Amount</Th>
                <Th>Pay to</Th>
              </THead>
              <TBody>
                {created.payouts.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium text-gray-900 whitespace-nowrap">{p.vendor.name}</Td>
                    <Td className="font-mono text-sm text-gray-900 whitespace-nowrap">{p.reference}</Td>
                    <Td className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(p.amount)}</Td>
                    <Td className="text-sm text-gray-700">{p.destination || "—"}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => !prepare.isPending && onClose()}
      title="Prepare Payout Batch"
      size="xl"
      footer={
        <>
          <Button className="flex-1" size="lg" loading={prepare.isPending} onClick={submit} disabled={eligible.length === 0}>
            <Layers className="size-5" /> Prepare Batch
          </Button>
          <Button variant="muted" size="lg" onClick={onClose} disabled={prepare.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 flex items-start gap-1.5">
          <Info className="size-4 mt-0.5 flex-shrink-0 text-blue-600" />
          Creates one <strong className="font-semibold">processing</strong> payout per vendor for their whole payable balance. Vendors with a payout already
          processing are skipped. Nothing is transferred automatically.
        </p>
        {eligible.length === 0 ? (
          <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">No vendor has a payable balance without a payout in progress.</p>
        ) : (
          <>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="sr-only">Vendors</legend>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input type="radio" name="batch-mode" checked={mode === "all"} onChange={() => setMode("all")} className="text-blue-600" />
                Every vendor with a payable balance ({eligible.length})
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input type="radio" name="batch-mode" checked={mode === "some"} onChange={() => setMode("some")} className="text-blue-600" />
                Only the vendors I choose
              </label>
            </fieldset>
            {mode === "some" && (
              <div>
                <ul className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {eligible.map((v) => (
                    <li key={v.vendor.id}>
                      <label className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                        <span className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={picked.includes(v.vendor.id)}
                            onChange={() => toggle(v.vendor.id)}
                            className="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-900 truncate">{v.vendor.name}</span>
                        </span>
                        <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">{formatTSh(v.payable)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {fe.vendors && <p className="text-xs text-red-600 mt-1">{fe.vendors}</p>}
              </div>
            )}
            <p className="text-sm text-gray-700">
              Estimated total: <span className="font-semibold text-gray-900">{formatTSh(selectedTotal)}</span>
            </p>
          </>
        )}
        <Field label="Notes" htmlFor="pb-notes" error={fe.notes}>
          <Textarea id="pb-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Friday payouts, week 39" />
        </Field>
        <FormAlert error={error} shown={["vendors", "notes"]} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- payout actions */

type PayoutAction = "paid" | "failed" | "reverse";

const ACTION: Record<PayoutAction, { title: string; button: string; variant: "success" | "danger"; hint: string }> = {
  paid: {
    title: "Mark Paid",
    button: "Mark Paid",
    variant: "success",
    hint: "The transfer was made. Its reference is kept as proof of payment and the vendor's orders become paid out.",
  },
  failed: {
    title: "Mark Failed",
    button: "Mark Failed",
    variant: "danger",
    hint: "The transfer didn't go through. The amount goes back to the vendor's payable balance.",
  },
  reverse: {
    title: "Reverse Payout",
    button: "Reverse Payout",
    variant: "danger",
    hint: "A paid transfer came back (e.g. wrong account). The amount goes back to the vendor's payable balance.",
  },
};

function PayoutActionModal({ payout, action, onClose }: { payout: Payout; action: PayoutAction; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const field = action === "paid" ? "transaction_reference" : "reason";
  const run = useApiMutation(
    () =>
      action === "paid"
        ? marketplaceApi.payouts.markPaid(payout.id, { transaction_reference: value.trim(), notes: notes.trim() })
        : action === "failed"
          ? marketplaceApi.payouts.markFailed(payout.id, { reason: value.trim() })
          : marketplaceApi.payouts.reverse(payout.id, { reason: value.trim() }),
    {
      invalidate: INVALIDATE,
      success: (p) => `${p.reference}: ${p.status_display}`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const submit = () => {
    if (!value.trim()) return setLocal({ [field]: action === "paid" ? "Enter the transfer reference." : "Give the reason." });
    setLocal({});
    setError(null);
    run.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const a = ACTION[action];

  return (
    <Modal
      open
      onClose={() => !run.isPending && onClose()}
      title={`${a.title} — ${payout.reference}`}
      size="lg"
      footer={
        <>
          <Button variant={a.variant} className="flex-1" loading={run.isPending} onClick={submit}>
            {a.button}
          </Button>
          <Button variant="muted" onClick={onClose} disabled={run.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm space-y-1">
          <p>
            <span className="text-gray-600">Vendor:</span> <span className="font-medium text-gray-900">{payout.vendor.name}</span>
          </p>
          <p>
            <span className="text-gray-600">Amount:</span> <span className="font-semibold text-gray-900">{formatTSh(payout.amount)}</span>
          </p>
          {payout.destination && (
            <p>
              <span className="text-gray-600">Pay to:</span> <span className="font-medium text-gray-900">{payout.destination}</span>
            </p>
          )}
        </div>
        <p className="text-sm text-gray-600">{a.hint}</p>
        {action === "paid" ? (
          <>
            <Field label="Transaction reference" required htmlFor="pa-ref" error={fe.transaction_reference} hint="Mobile money or bank transaction ID">
              <Input id="pa-ref" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} placeholder="e.g. QK7Z3XY12" invalid={Boolean(fe.transaction_reference)} />
            </Field>
            <Field label="Notes" htmlFor="pa-notes" error={fe.notes}>
              <Textarea id="pa-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Reason" required htmlFor="pa-reason" error={fe.reason}>
            <Textarea id="pa-reason" rows={3} maxLength={255} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Account number invalid" />
          </Field>
        )}
        <FormAlert error={error} shown={["transaction_reference", "reason", "notes"]} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ history table */

function Breakdown({ p }: { p: Payout }) {
  const rows: [string, string, string][] = [
    ["Gross", formatTSh(p.gross_sales), "text-gray-700"],
    ["Commission", `− ${formatTSh(p.commission)}`, "text-gray-700"],
  ];
  if (Number(p.refund_deductions)) rows.push(["Refunds", `− ${formatTSh(p.refund_deductions)}`, "text-red-700"]);
  if (Number(p.adjustments)) {
    const n = Number(p.adjustments);
    rows.push(["Adjustments", `${n < 0 ? "−" : "+"} ${formatTSh(Math.abs(n))}`, n < 0 ? "text-red-700" : "text-green-700"]);
  }
  return (
    <dl className="text-xs space-y-0.5 min-w-40">
      {rows.map(([k, v, cls]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="text-gray-500">{k}</dt>
          <dd className={cn("whitespace-nowrap", cls)}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Payout history (all vendors, or one when `vendorId` is given), with Finance's status actions. */
export function PayoutsTable({ vendorId, pageSize = 10, showFilter }: { vendorId?: number; pageSize?: number; showFilter?: boolean }) {
  const canPay = useCanRecordPayout();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [acting, setActing] = useState<{ payout: Payout; action: PayoutAction } | null>(null);
  const query = { vendor: vendorId, status, page, page_size: pageSize };
  const list = useQuery({
    queryKey: marketplaceKeys.payouts(query),
    queryFn: ({ signal }) => marketplaceApi.payouts.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const headers = [
    ...(vendorId ? [] : ["Vendor"]),
    "Payout",
    "Status",
    "Amount",
    "Breakdown",
    "Method / Pay to",
    "Transaction Ref",
    "Orders",
    "Paid On",
    "Recorded / Processed",
    ...(canPay ? ["Actions"] : []),
  ];

  const filter = showFilter && (
    <div className="px-6 py-3 border-b border-gray-200 flex justify-end">
      <Select
        className="w-full sm:w-auto"
        aria-label="Filter payouts by status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
      >
        <option value="all">All statuses</option>
        <option value="processing">Processing</option>
        <option value="paid">Paid</option>
        <option value="failed">Failed</option>
        <option value="reversed">Reversed</option>
      </Select>
    </div>
  );

  if (list.isError && !list.data) {
    const forbidden = list.error instanceof ApiError && list.error.status === 403;
    return forbidden ? (
      <p className="px-6 py-8 text-sm text-gray-500 text-center">You don&apos;t have access to payout records.</p>
    ) : (
      <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />
    );
  }
  if (!list.isPending && rows.length === 0) {
    return (
      <>
        {filter}
        <EmptyState
          bare
          icon={Wallet}
          title={status === "all" ? "No payouts yet" : "No payouts with this status"}
          description={status === "all" ? "Payouts recorded for vendors appear here." : undefined}
        />
      </>
    );
  }
  return (
    <>
      {filter}
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
                  {p.batch && <div className="text-xs text-gray-500 font-mono whitespace-nowrap">Batch {p.batch}</div>}
                  {p.notes && (
                    <div className="text-xs text-gray-500 max-w-56 line-clamp-2" title={p.notes}>
                      {p.notes}
                    </div>
                  )}
                </Td>
                <Td>
                  <PayoutStatusBadge status={p.status} label={p.status_display} />
                  {p.failure_reason && (
                    <div className="text-xs text-red-700 mt-1 max-w-48 line-clamp-2" title={p.failure_reason}>
                      {p.failure_reason}
                    </div>
                  )}
                </Td>
                <Td className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(p.amount)}</Td>
                <Td>
                  <Breakdown p={p} />
                </Td>
                <Td className="text-sm text-gray-700">
                  <div className="whitespace-nowrap">{p.method_display}</div>
                  {p.destination && (
                    <div className="text-xs text-gray-500 max-w-56 line-clamp-2" title={p.destination}>
                      {p.destination}
                    </div>
                  )}
                </Td>
                <Td className="text-sm text-gray-700 font-mono">{p.transaction_reference || "—"}</Td>
                <Td className="text-sm text-gray-700">{p.orders ?? "—"}</Td>
                <Td className="text-sm text-gray-700 whitespace-nowrap">{formatDateTime(p.paid_at)}</Td>
                <Td className="text-sm text-gray-700 whitespace-nowrap">
                  <div>{p.recorded_by ?? "—"}</div>
                  {p.processed_by && (
                    <div className="text-xs text-gray-500">
                      {p.processed_by} · {formatDateTime(p.processed_at)}
                    </div>
                  )}
                </Td>
                {canPay && (
                  <Td>
                    {p.status === "processing" ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="success" onClick={() => setActing({ payout: p, action: "paid" })}>
                          <CheckCircle2 className="size-4" /> Mark Paid
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => setActing({ payout: p, action: "failed" })}>
                          <XCircle className="size-4" /> Failed
                        </Button>
                      </div>
                    ) : p.status === "paid" ? (
                      <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => setActing({ payout: p, action: "reverse" })}>
                        <RotateCcw className="size-4" /> Reverse
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </Td>
                )}
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
      {acting && <PayoutActionModal payout={acting.payout} action={acting.action} onClose={() => setActing(null)} />}
    </>
  );
}
