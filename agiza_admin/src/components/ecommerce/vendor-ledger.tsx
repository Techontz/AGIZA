"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, PlusCircle, ScrollText } from "lucide-react";
import { useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import { catalogKeys } from "@/lib/api/services/catalog";
import { marketplaceApi, marketplaceKeys, type LedgerBalance, type LedgerKind } from "@/lib/api/services/marketplace";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTSh } from "@/lib/format";

import { useCanAdjustLedger } from "./payouts";

const MANAGE_ONLY = "Balance adjustments need Manage access to the Finance module.";

const KIND_TONE: Record<LedgerKind, BadgeTone> = {
  earning: "green",
  refund: "red",
  adjustment: "purple",
  payout: "blue",
  payout_reversal: "orange",
};

const KIND_SHORT: Record<LedgerKind, string> = {
  earning: "Earning",
  refund: "Refund",
  adjustment: "Adjustment",
  payout: "Payout",
  payout_reversal: "Payout reversed",
};

function signed(v: string) {
  const n = Number(v);
  return (
    <span className={cn("whitespace-nowrap font-semibold", n < 0 ? "text-red-700" : n > 0 ? "text-green-700" : "text-gray-500")}>
      {n < 0 ? "−" : n > 0 ? "+" : ""} {formatTSh(Math.abs(n))}
    </span>
  );
}

/** How the payable balance is made up (from the ledger). */
function BalanceBreakdown({ b }: { b: LedgerBalance }) {
  const adj = Number(b.adjustments);
  const rows: [string, string, string][] = [
    ["Gross sales (delivered & paid)", formatTSh(b.gross_sales), "text-gray-900"],
    ["AGIZA commission", `− ${formatTSh(b.commission)}`, "text-gray-700"],
    ["Refunds to customers", `− ${formatTSh(b.refunds)}`, Number(b.refunds) ? "text-red-700" : "text-gray-700"],
    ["Adjustments", `${adj < 0 ? "−" : "+"} ${formatTSh(Math.abs(adj))}`, adj < 0 ? "text-red-700" : adj > 0 ? "text-green-700" : "text-gray-700"],
    ["Paid out", `− ${formatTSh(b.paid_out)}`, "text-gray-700"],
    ["In a processing payout", `− ${formatTSh(b.in_payout)}`, Number(b.in_payout) ? "text-amber-700" : "text-gray-700"],
  ];
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-gray-600">{k}</dt>
            <dd className={cn("whitespace-nowrap", cls)}>{v}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 pt-2 border-t border-gray-200 font-semibold">
          <dt className="text-gray-900">Payable now</dt>
          <dd className="text-blue-700 whitespace-nowrap">{formatTSh(b.payable)}</dd>
        </div>
      </dl>
      <p className="text-xs text-gray-500 mt-3">
        Not yet payable: <span className="font-medium text-amber-700">{formatTSh(b.pending)}</span> (orders not yet delivered and fully paid).
      </p>
    </div>
  );
}

/** A vendor's ledger: balance breakdown, every entry, and Finance's manual adjustments. */
export function VendorLedger({ vendor }: { vendor: { id: number; name: string } }) {
  const canAdjust = useCanAdjustLedger();
  const [adjusting, setAdjusting] = useState(false);
  const ledger = useQuery({ queryKey: marketplaceKeys.ledger(vendor.id), queryFn: ({ signal }) => marketplaceApi.ledger(vendor.id, signal) });

  if (ledger.isError && !ledger.data) {
    const forbidden = ledger.error instanceof ApiError && ledger.error.status === 403;
    return forbidden ? (
      <p className="px-6 py-8 text-sm text-gray-500 text-center">You don&apos;t have access to the vendor ledger.</p>
    ) : (
      <ErrorState bare message={errorText(ledger.error)} onRetry={() => ledger.refetch()} />
    );
  }
  const entries = ledger.data?.entries ?? [];

  return (
    <div>
      <div className="px-6 pt-5 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Ledger</h3>
          <p className="text-sm text-gray-600">Every change to what AGIZA owes this vendor: earnings, refunds, adjustments and payouts.</p>
        </div>
        {canAdjust && (
          <Button variant="outline" onClick={() => setAdjusting(true)} className="flex-shrink-0">
            <PlusCircle className="size-4" /> Adjustment
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 px-6 pb-6">
        <div>
          {ledger.data ? (
            <BalanceBreakdown b={ledger.data.balance} />
          ) : (
            <div className="border border-gray-200 rounded-lg p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          )}
        </div>
        <div className="xl:col-span-2 border border-gray-200 rounded-lg overflow-hidden">
          {!ledger.isPending && entries.length === 0 ? (
            <EmptyState bare icon={ScrollText} title="No ledger entries yet" description="Entries appear once an order is delivered and paid." />
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <Table>
                <THead>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th>Reference</Th>
                  <Th>Amount</Th>
                  <Th>Note</Th>
                </THead>
                <TBody>
                  {ledger.isPending ? (
                    <TableSkeletonRows rows={4} columns={5} />
                  ) : (
                    entries.map((e) => (
                      <Tr key={e.id}>
                        <Td className="text-sm text-gray-700 whitespace-nowrap">
                          {formatDateTime(e.at)}
                          <div className="text-xs text-gray-500">{e.by}</div>
                        </Td>
                        <Td>
                          <span title={e.kind_display}>
                            <Badge tone={KIND_TONE[e.kind] ?? "gray"}>{KIND_SHORT[e.kind] ?? e.kind_display}</Badge>
                          </span>
                        </Td>
                        <Td className="text-sm font-mono text-gray-700 whitespace-nowrap">{e.reference || "—"}</Td>
                        <Td>
                          {signed(e.amount)}
                          {e.kind === "earning" && e.gross_amount && (
                            <div className="text-xs text-gray-500 whitespace-nowrap">
                              {formatTSh(e.gross_amount)} − {formatTSh(e.commission_amount)} commission
                            </div>
                          )}
                        </Td>
                        <Td className="text-sm text-gray-600">
                          <span className="line-clamp-2 max-w-64" title={e.note}>
                            {e.note || "—"}
                          </span>
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          )}
        </div>
      </div>
      {adjusting && <AdjustmentModal vendor={vendor} payable={ledger.data?.balance.payable} onClose={() => setAdjusting(false)} />}
    </div>
  );
}

function AdjustmentModal({ vendor, payable, onClose }: { vendor: { id: number; name: string }; payable?: string; onClose: () => void }) {
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const adjust = useApiMutation(
    () => marketplaceApi.adjust({ vendor: vendor.id, amount: `${direction === "debit" ? "-" : ""}${Number(amount).toFixed(2)}`, reason: reason.trim() }),
    {
      invalidate: [marketplaceKeys.all, catalogKeys.vendors, ["finance"]],
      success: (r) => `Adjustment recorded. ${vendor.name} now has ${formatTSh(r.balance.payable)} payable`,
      onSuccess: onClose,
      onError: (e) => setError(e instanceof ApiError && e.status === 403 ? new ApiError(403, "forbidden", MANAGE_ONLY) : e),
    },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!(Number(amount) > 0)) errs.amount = "Enter an amount greater than zero.";
    if (!reason.trim()) errs.reason = "Give the reason for the adjustment.";
    setLocal(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    adjust.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  return (
    <Modal
      open
      onClose={() => !adjust.isPending && onClose()}
      title={
        <span className="block">
          Balance Adjustment
          <span className="block text-sm font-normal text-gray-600 mt-1">{vendor.name}</span>
        </span>
      }
      size="lg"
      footer={
        <>
          <Button className="flex-1" variant={direction === "debit" ? "danger" : "primary"} loading={adjust.isPending} onClick={submit}>
            {direction === "debit" ? "Debit Vendor" : "Credit Vendor"}
          </Button>
          <Button variant="muted" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          A manual correction to what AGIZA owes this vendor, e.g. a damaged item charged back or a missed earning. It is kept in the ledger with your name.
          {payable !== undefined && (
            <>
              {" "}
              Payable now: <span className="font-semibold text-gray-900">{formatTSh(payable)}</span>.
            </>
          )}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Type" required htmlFor="adj-dir">
            <Select id="adj-dir" value={direction} onChange={(e) => setDirection(e.target.value as "credit" | "debit")}>
              <option value="credit">Credit (+) — AGIZA owes more</option>
              <option value="debit">Debit (−) — AGIZA owes less</option>
            </Select>
          </Field>
          <Field label="Amount (TSh)" required htmlFor="adj-amount" error={fe.amount}>
            <Input id="adj-amount" type="number" min="0" step="100" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(fe.amount)} />
          </Field>
        </div>
        <Field label="Reason" required htmlFor="adj-reason" error={fe.reason}>
          <Textarea id="adj-reason" rows={3} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["amount", "reason"]} />
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- documents */

/** Documents the vendor uploaded (licence, TIN certificate, ID...). Private to the owner and staff. */
export function VendorDocuments({ vendorId }: { vendorId: number }) {
  const docs = useQuery({ queryKey: marketplaceKeys.documents(vendorId), queryFn: ({ signal }) => marketplaceApi.documents(vendorId, signal) });
  if (docs.isError) return <ErrorState bare message={errorText(docs.error)} onRetry={() => docs.refetch()} />;
  if (docs.isPending) {
    return (
      <div className="p-6 space-y-3" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (!docs.data.length) {
    return <EmptyState bare icon={FileText} title="No documents" description="Documents the vendor uploads from the seller area (licence, TIN certificate, ID) appear here." />;
  }
  return (
    <Table>
      <THead>
        <Th>Document</Th>
        <Th>File</Th>
        <Th>Uploaded</Th>
        <Th>Actions</Th>
      </THead>
      <TBody>
        {docs.data.map((d) => (
          <Tr key={d.id}>
            <Td className="font-medium text-gray-900 whitespace-nowrap">
              <span className="inline-flex items-center gap-2">
                <FileText className="size-4 text-gray-400" /> {d.kind_display}
              </span>
            </Td>
            <Td className="text-sm text-gray-700">
              <span className="max-w-72 truncate block" title={d.original_name}>
                {d.original_name || "—"}
              </span>
              <span className="text-xs text-gray-500">{d.content_type}</span>
            </Td>
            <Td className="text-sm text-gray-700 whitespace-nowrap">{formatDateTime(d.uploaded_at)}</Td>
            <Td>
              <div className="flex items-center gap-3">
                <a href={fileSrc(d.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800">
                  <ExternalLink className="size-4" /> Open
                </a>
                <a href={fileSrc(d.url)} download={d.original_name || true} className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
                  <Download className="size-4" /> Download
                </a>
              </div>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
