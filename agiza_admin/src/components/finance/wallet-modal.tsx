"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, PlusCircle, SlidersHorizontal, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys, type ManualMethod, type WalletDetail } from "@/lib/api/services/finance";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTSh } from "@/lib/format";

import { DialogFooter, FormAlert, METHODS, PlanStatusBadge, formatDay, mergedErrors, parseAmount } from "./shared";

/* ---------------------------------------------------------------- top up */

function TopUpDialog({ wallet, open, onClose }: { wallet: WalletDetail; open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ManualMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setAmount("");
      setMethod("cash");
      setReference("");
      setNote("");
      setError(null);
      setLocal({});
    }
  }, [open]);
  const topUp = useApiMutation(
    (v: { amount: string; method: ManualMethod; reference: string; note: string }) => financeApi.wallets.topUp(wallet.customer.id, v),
    { invalidate: [financeKeys.all], success: (w) => `Wallet topped up — balance ${formatTSh(w.wallet_balance)}`, onSuccess: onClose, onError: setError },
  );
  const submit = () => {
    const n = parseAmount(amount);
    if (n === null || n <= 0) return setLocal({ amount: "Enter an amount greater than zero." });
    setLocal({});
    topUp.mutate({ amount: String(n), method, reference: reference.trim(), note: note.trim() });
  };
  const fe = mergedErrors(error, local);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Top Up — ${wallet.customer.full_name}`}
      size="lg"
      footer={<DialogFooter label="Top Up Wallet" variant="success" onSubmit={submit} onClose={onClose} pending={topUp.isPending} />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Amount (TSh)" required htmlFor="tu-amount" error={fe.amount}>
            <Input id="tu-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(fe.amount)} />
          </Field>
          <Field label="Received Via" required htmlFor="tu-method" error={fe.method}>
            <Select id="tu-method" value={method} onChange={(e) => setMethod(e.target.value as ManualMethod)}>
              {METHODS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Reference" htmlFor="tu-ref" error={fe.reference} hint="Receipt or transaction number">
          <Input id="tu-ref" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="tu-note" error={fe.note}>
          <Input id="tu-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["amount", "method", "reference", "note"]} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- adjust */

function AdjustDialog({ wallet, open, onClose }: { wallet: WalletDetail; open: boolean; onClose: () => void }) {
  const [credit, setCredit] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setCredit(true);
      setAmount("");
      setNote("");
      setError(null);
      setLocal({});
    }
  }, [open]);
  const adjust = useApiMutation(
    (v: { amount: string; credit: boolean; note: string }) => financeApi.wallets.adjust(wallet.customer.id, v),
    { invalidate: [financeKeys.all], success: (w) => `Wallet adjusted — balance ${formatTSh(w.wallet_balance)}`, onSuccess: onClose, onError: setError },
  );
  const balance = Number(wallet.wallet_balance);
  const submit = () => {
    const n = parseAmount(amount);
    const errs: Record<string, string> = {};
    if (n === null || n <= 0) errs.amount = "Enter an amount greater than zero.";
    else if (!credit && n > balance) errs.amount = `The wallet only holds ${formatTSh(balance)}.`;
    if (!note.trim()) errs.note = "Give the reason for the adjustment.";
    setLocal(errs);
    if (Object.keys(errs).length || n === null) return;
    adjust.mutate({ amount: String(n), credit, note: note.trim() });
  };
  const fe = mergedErrors(error, local);
  const n = parseAmount(amount);
  const after = n === null ? null : credit ? balance + n : balance - n;

  return (
    <ConfirmDialog
      open={open}
      title={`Adjust Wallet — ${wallet.customer.full_name}`}
      message="Adjustments change the balance directly (corrections, goodwill credits). They are recorded in the audit log."
      confirmLabel={credit ? "Credit Wallet" : "Debit Wallet"}
      tone={credit ? "success" : "danger"}
      pending={adjust.isPending}
      onConfirm={submit}
      onClose={onClose}
    >
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
          {[true, false].map((c) => (
            <button
              key={String(c)}
              type="button"
              role="radio"
              aria-checked={credit === c}
              onClick={() => setCredit(c)}
              className={cn(
                "p-3 rounded-lg border-2 text-sm font-medium flex items-center justify-center gap-2 transition-all",
                credit === c ? (c ? "border-green-600 bg-green-50 text-green-800" : "border-red-600 bg-red-50 text-red-800") : "border-gray-200 text-gray-700 hover:border-gray-300",
              )}
            >
              {c ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
              {c ? "Credit (add)" : "Debit (remove)"}
            </button>
          ))}
        </div>
        <Field label="Amount (TSh)" required htmlFor="adj-amount" error={fe.amount}>
          <Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(fe.amount)} />
        </Field>
        <Field label="Reason" required htmlFor="adj-note" error={fe.note}>
          <Textarea id="adj-note" rows={2} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-sm text-gray-600">
          Balance {formatTSh(balance)}
          {after !== null && after >= 0 && <> → <span className="font-semibold text-gray-900">{formatTSh(after)}</span></>}
        </p>
        <FormAlert error={error} shown={["amount", "note", "credit"]} />
      </div>
    </ConfirmDialog>
  );
}

/* ---------------------------------------------------------------- wallet */

export function WalletModal({
  customerId,
  canEdit,
  canManage,
  onClose,
}: {
  customerId: number;
  canEdit: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  const wallet = useQuery({ queryKey: financeKeys.wallet(customerId), queryFn: () => financeApi.wallets.get(customerId) });
  const [dialog, setDialog] = useState<"top-up" | "adjust" | null>(null);
  const w = wallet.data;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={w ? w.customer.full_name : "Customer Wallet"}
        size="4xl"
        footer={
          w ? (
            <div className="flex flex-wrap gap-2 w-full">
              {canEdit && (
                <Button variant="success" onClick={() => setDialog("top-up")}>
                  <PlusCircle className="size-4" /> Top Up
                </Button>
              )}
              {canManage && (
                <Button variant="outline" onClick={() => setDialog("adjust")}>
                  <SlidersHorizontal className="size-4" /> Adjust
                </Button>
              )}
              <Button variant="muted" className="sm:ml-auto" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : undefined
        }
      >
        {wallet.isPending ? (
          <div className="space-y-4" aria-busy="true">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
            <Skeleton className="h-40 w-full" />
          </div>
        ) : wallet.isError || !w ? (
          <ErrorState bare message={errorText(wallet.error)} onRetry={() => wallet.refetch()} />
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500 -mt-2">
              {w.customer.reference}
              {w.customer.phone ? ` · ${w.customer.phone}` : ""}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 flex items-center gap-1"><Wallet className="size-4" /> Wallet Balance</p>
                <p className="text-xl font-bold text-blue-900">{formatTSh(w.wallet_balance)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-600">Total Orders</p>
                <p className="text-xl font-bold text-gray-900">{w.total_orders}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">Total Paid</p>
                <p className="text-xl font-bold text-green-900">{formatTSh(w.total_paid)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">Total Due</p>
                <p className="text-xl font-bold text-red-900">{formatTSh(w.total_due)}</p>
              </div>
            </div>

            {w.installment_plans.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Installment Plans</h3>
                <div className="space-y-2">
                  {w.installment_plans.map((p) => (
                    <div key={p.plan_id} className="flex flex-wrap items-center justify-between gap-2 border border-gray-200 rounded-lg px-4 py-3 text-sm">
                      <div>
                        <span className="font-medium text-gray-900">{p.order}</span>
                        <span className="text-gray-600 ml-2">
                          {formatTSh(p.paid)} of {formatTSh(p.total)} paid
                        </span>
                        {p.next_due && (
                          <div className="text-xs text-gray-600">
                            Next: {formatTSh(p.next_amount)} on {formatDay(p.next_due)}
                          </div>
                        )}
                      </div>
                      <PlanStatusBadge status={p.status} label={p.status_display} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Transactions</h3>
              {w.transactions.length === 0 ? (
                <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-6 text-center">No wallet transactions yet.</p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Date", "Type", "Amount", "Balance After", "Details", "By"].map((h) => (
                          <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {w.transactions.map((t) => {
                        const credit = t.kind === "credit";
                        const method = METHODS.find(([v]) => v === t.method)?.[1];
                        return (
                          <tr key={t.id}>
                            <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                            <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{t.source_display}</td>
                            <td className={`px-4 py-3 font-semibold whitespace-nowrap ${credit ? "text-green-600" : "text-red-600"}`}>
                              {credit ? "+" : "−"}
                              {formatTSh(t.amount)}
                            </td>
                            <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{formatTSh(t.balance_after)}</td>
                            <td className="px-4 py-3 text-gray-700 min-w-48">
                              {[t.order, method, t.reference, t.note].filter(Boolean).join(" · ") || "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{t.created_by?.full_name ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {w.transactions.length >= 100 && <p className="text-xs text-gray-500 mt-2">Showing the latest 100 transactions.</p>}
            </div>
          </div>
        )}
      </Modal>

      {w && <TopUpDialog wallet={w} open={dialog === "top-up"} onClose={() => setDialog(null)} />}
      {w && <AdjustDialog wallet={w} open={dialog === "adjust"} onClose={() => setDialog(null)} />}
    </>
  );
}
