"use client";

import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Download, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys, type Invoice, type ManualMethod } from "@/lib/api/services/finance";
import { formatDateTime, formatTSh } from "@/lib/format";

import { DialogFooter, FINANCE_INVALIDATE, FormAlert, InvoiceStatusBadge, METHODS, formatDay, mergedErrors } from "./shared";

/** Fetch the invoice PDF through the proxy and save it. */
export function usePdfDownload() {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const download = useCallback(async (invoice: Pick<Invoice, "id" | "reference">) => {
    setPendingId(invoice.id);
    try {
      const res = await fetch(financeApi.invoices.pdfUrl(invoice.id), { credentials: "same-origin" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setPendingId(null);
    }
  }, []);
  return { download, pendingId };
}

function MarkPaidDialog({ invoice, open, onClose }: { invoice: Invoice; open: boolean; onClose: () => void }) {
  const [method, setMethod] = useState<ManualMethod>("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setMethod("cash");
      setReference("");
      setError(null);
    }
  }, [open]);
  const pay = useApiMutation(() => financeApi.invoices.markPaid(invoice.id, { method, reference: reference.trim() }), {
    invalidate: FINANCE_INVALIDATE,
    success: (i) => `${i.reference} marked paid`,
    onSuccess: onClose,
    onError: setError,
  });
  const fe = mergedErrors(error, {});
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mark Paid — ${invoice.reference}`}
      size="md"
      footer={<DialogFooter label="Mark Paid" variant="success" onSubmit={() => pay.mutate(undefined)} onClose={onClose} pending={pay.isPending} />}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Records that the full {formatTSh(invoice.totals.total)} was received.
        </p>
        <Field label="Method" required htmlFor="mp-method" error={fe.method}>
          <Select id="mp-method" value={method} onChange={(e) => setMethod(e.target.value as ManualMethod)}>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="mp-ref" error={fe.reference} hint="Receipt or transaction number">
          <Input id="mp-ref" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["method", "reference"]} />
      </div>
    </Modal>
  );
}

/** "View": lines, totals incl. VAT, balance and the status actions. */
export function InvoiceDetailModal({ invoiceId, canEdit, onClose }: { invoiceId: number; canEdit: boolean; onClose: () => void }) {
  const inv = useQuery({ queryKey: financeKeys.invoice(invoiceId), queryFn: () => financeApi.invoices.get(invoiceId) });
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [markPaid, setMarkPaid] = useState(false);
  const { download, pendingId } = usePdfDownload();

  const send = useApiMutation(() => financeApi.invoices.send(invoiceId), {
    invalidate: [financeKeys.all],
    success: (i) => `${i.reference} marked as sent`,
  });
  const voidInv = useApiMutation(() => financeApi.invoices.void(invoiceId), {
    invalidate: [financeKeys.all],
    success: (i) => `${i.reference} voided`,
    onSuccess: () => setConfirmVoid(false),
  });

  const i = inv.data;
  const open = i && (i.status === "draft" || i.status === "sent");
  const manualPay = open && i.source !== "order";

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={i ? `Invoice ${i.reference}` : "Invoice"}
        size="3xl"
        footer={
          i ? (
            <div className="flex flex-wrap gap-2 w-full">
              <Button variant="outline" onClick={() => download(i)} loading={pendingId === i.id}>
                <Download className="size-4" /> Download PDF
              </Button>
              {canEdit && i.status === "draft" && (
                <Button onClick={() => send.mutate(undefined)} loading={send.isPending}>
                  <Send className="size-4" /> Mark as Sent
                </Button>
              )}
              {canEdit && manualPay && (
                <Button variant="success" onClick={() => setMarkPaid(true)}>
                  <CheckCircle2 className="size-4" /> Mark Paid
                </Button>
              )}
              {canEdit && open && (
                <Button variant="danger" onClick={() => setConfirmVoid(true)}>
                  <Ban className="size-4" /> Void
                </Button>
              )}
              <Button variant="muted" className="sm:ml-auto" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {inv.isPending ? (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : inv.isError || !i ? (
          <ErrorState bare message={errorText(inv.error)} onRetry={() => inv.refetch()} />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <InvoiceStatusBadge status={i.status} />
              <span className="text-sm text-gray-600">{i.source_display}</span>
              {i.linked && (
                <span className="text-sm text-gray-600">
                  · {i.linked.kind === "order" ? "Order" : "Quote"} <span className="font-medium text-gray-900">{i.linked.reference}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Bill To</p>
                <p className="font-semibold text-gray-900">{i.customer.full_name}</p>
                <p className="text-xs text-gray-500">{[i.customer.phone, i.customer.email].filter(Boolean).join(" · ")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Issue Date</p>
                <p className="font-semibold text-gray-900">{formatDay(i.issue_date)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Due Date</p>
                <p className="font-semibold text-gray-900">{formatDay(i.due_date)}</p>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Description</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Qty</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Unit Price</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {i.items.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 text-gray-900">{l.description}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{Number(l.quantity).toLocaleString("en-US")}</td>
                      <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{formatTSh(l.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatTSh(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:ml-auto sm:max-w-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-semibold">{formatTSh(i.totals.subtotal)}</span>
              </div>
              {Number(i.tax_rate) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700">VAT {Number(i.tax_rate)}%:</span>
                  <span className="font-semibold">{formatTSh(i.totals.tax)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="font-semibold text-gray-900">Total:</span>
                <span className="font-bold text-gray-900">{formatTSh(i.totals.total)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>Paid:</span>
                <span className="font-semibold">{formatTSh(i.totals.paid)}</span>
              </div>
              <div className="flex justify-between text-red-600 pt-2 border-t">
                <span className="font-semibold">Balance:</span>
                <span className="font-bold">{formatTSh(i.totals.balance)}</span>
              </div>
            </div>

            {i.linked?.kind === "order" && open && (
              <p className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                This invoice follows the payments of order {i.linked.reference}; it is marked paid automatically once the order is fully paid.
              </p>
            )}
            {i.notes && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Notes</p>
                <p className="text-gray-900 whitespace-pre-line">{i.notes}</p>
              </div>
            )}
            <div className="text-xs text-gray-500 space-y-1">
              <p>Created {formatDateTime(i.created_at)}{i.created_by ? ` by ${i.created_by.full_name}` : ""}</p>
              {i.sent_at && <p>Sent {formatDateTime(i.sent_at)}</p>}
              {i.paid_at && (
                <p>
                  Paid {formatDateTime(i.paid_at)}
                  {i.payment_method ? ` · ${METHODS.find(([v]) => v === i.payment_method)?.[1] ?? i.payment_method}` : ""}
                  {i.payment_reference ? ` · ${i.payment_reference}` : ""}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {i && <MarkPaidDialog invoice={i} open={markPaid} onClose={() => setMarkPaid(false)} />}
      {i && (
        <ConfirmDialog
          open={confirmVoid}
          title={`Void ${i.reference}?`}
          message="A voided invoice can't be sent or paid. This can't be undone."
          confirmLabel="Void Invoice"
          tone="danger"
          pending={voidInv.isPending}
          onConfirm={() => voidInv.mutate(undefined)}
          onClose={() => setConfirmVoid(false)}
        />
      )}
    </>
  );
}
