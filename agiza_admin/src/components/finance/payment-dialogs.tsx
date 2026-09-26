"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import {
  financeApi,
  financeKeys,
  type ManualMethod,
  type OrderPayment,
  type PaymentKind,
} from "@/lib/api/services/finance";
import { formatTSh } from "@/lib/format";

import { DialogFooter, FINANCE_INVALIDATE, FormAlert, KINDS, METHODS, mergedErrors, parseAmount } from "./shared";

function OrderSummary({ order }: { order: OrderPayment }) {
  const f = order.figures;
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid grid-cols-3 gap-3 text-sm">
      <div>
        <p className="text-gray-600">Total</p>
        <p className="font-semibold text-gray-900">{formatTSh(f.total)}</p>
      </div>
      <div>
        <p className="text-gray-600">Paid</p>
        <p className="font-semibold text-green-600">{formatTSh(f.paid)}</p>
      </div>
      <div>
        <p className="text-gray-600">Balance</p>
        <p className="font-semibold text-red-600">{formatTSh(f.due)}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- cost editor */

/** The pencil beside Profit: purchase & shipping cost (empty = automatic default). */
export function CostsDialog({ order, onClose }: { order: OrderPayment | null; onClose: () => void }) {
  const [purchase, setPurchase] = useState("");
  const [shipping, setShipping] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (order) {
      setPurchase(order.figures.purchase_cost_set ? (order.figures.purchase_cost ?? "") : "");
      setShipping(order.figures.shipping_cost_set ? (order.figures.shipping_cost ?? "") : "");
      setError(null);
      setLocal({});
    }
  }, [order]);

  const save = useApiMutation(
    (v: { purchase_cost: string | null; shipping_cost: string | null }) => financeApi.orderPayments.setCosts(order!.id, v),
    { invalidate: [financeKeys.all], success: (o) => `${o.reference}: costs updated`, onSuccess: onClose, onError: setError },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (purchase.trim() && parseAmount(purchase) === null) errs.purchase_cost = "Enter an amount, e.g. 150000.";
    if (shipping.trim() && parseAmount(shipping) === null) errs.shipping_cost = "Enter an amount, e.g. 25000.";
    setLocal(errs);
    if (Object.keys(errs).length) return;
    save.mutate({
      purchase_cost: purchase.trim() ? String(parseAmount(purchase)) : null,
      shipping_cost: shipping.trim() ? String(parseAmount(shipping)) : null,
    });
  };
  const fe = mergedErrors(error, local);
  if (!order) return null;
  const f = order.figures;
  const auto = (set: boolean, value: string | null) =>
    set ? "Leave empty to use the automatic default." : `Automatic: ${value === null ? "none recorded" : formatTSh(value)}. Enter a value to override.`;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Costs — ${order.reference}`}
      size="lg"
      footer={<DialogFooter label="Save Costs" onSubmit={submit} onClose={onClose} pending={save.isPending} />}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Profit = total ({formatTSh(f.total)}) − purchase cost − shipping cost.
        </p>
        <Field label="Purchase Cost (TSh)" htmlFor="fc-purchase" error={fe.purchase_cost} hint={auto(f.purchase_cost_set, f.purchase_cost)}>
          <Input id="fc-purchase" inputMode="decimal" value={purchase} onChange={(e) => setPurchase(e.target.value)} placeholder={f.purchase_cost ?? "0"} invalid={Boolean(fe.purchase_cost)} />
        </Field>
        <Field label="Shipping Cost (TSh)" htmlFor="fc-shipping" error={fe.shipping_cost} hint={auto(f.shipping_cost_set, f.shipping_cost)}>
          <Input id="fc-shipping" inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder={f.shipping_cost ?? "0"} invalid={Boolean(fe.shipping_cost)} />
        </Field>
        <FormAlert error={error} shown={["purchase_cost", "shipping_cost"]} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- record payment */

export function RecordPaymentDialog({ order, onClose }: { order: OrderPayment | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ManualMethod>("cash");
  const [kind, setKind] = useState<Exclude<PaymentKind, "refund">>("balance");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (order) {
      setAmount(order.figures.due && Number(order.figures.due) > 0 ? order.figures.due : "");
      setMethod("cash");
      setKind("balance");
      setReference("");
      setPaidAt("");
      setNotes("");
      setError(null);
      setLocal({});
    }
  }, [order]);

  const record = useApiMutation(
    (v: Parameters<typeof financeApi.payments.record>[0]) => financeApi.payments.record(v),
    { invalidate: FINANCE_INVALIDATE, success: (p) => `${formatTSh(p.amount)} recorded on ${p.order.reference}`, onSuccess: onClose, onError: setError },
  );
  const submit = () => {
    if (!order) return;
    const n = parseAmount(amount);
    const errs: Record<string, string> = {};
    if (n === null || n <= 0) errs.amount = "Enter an amount greater than zero.";
    else if (order.figures.due !== null && n > Number(order.figures.due)) errs.amount = `The balance is ${formatTSh(order.figures.due)}.`;
    if (paidAt && new Date(paidAt).getTime() > Date.now()) errs.paid_at = "The payment date can't be in the future.";
    setLocal(errs);
    if (Object.keys(errs).length || n === null) return;
    record.mutate({
      order: order.id,
      amount: String(n),
      method,
      kind,
      reference: reference.trim(),
      notes: notes.trim(),
      ...(paidAt ? { paid_at: new Date(paidAt).toISOString() } : {}),
    });
  };
  const fe = mergedErrors(error, local);
  if (!order) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record Payment — ${order.reference}`}
      size="lg"
      footer={<DialogFooter label="Record Payment" variant="success" onSubmit={submit} onClose={onClose} pending={record.isPending} />}
    >
      <div className="space-y-4">
        <OrderSummary order={order} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Amount (TSh)" required htmlFor="rp-amount" error={fe.amount}>
            <Input id="rp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(fe.amount)} />
          </Field>
          <Field label="Method" required htmlFor="rp-method" error={fe.method}>
            <Select id="rp-method" value={method} onChange={(e) => setMethod(e.target.value as ManualMethod)}>
              {METHODS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Payment Type" htmlFor="rp-kind" error={fe.kind}>
            <Select id="rp-kind" value={kind} onChange={(e) => setKind(e.target.value as Exclude<PaymentKind, "refund">)}>
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" htmlFor="rp-ref" error={fe.reference} hint="Receipt or transaction number">
            <Input id="rp-ref" value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Paid At" htmlFor="rp-date" error={fe.paid_at} hint="Optional — defaults to now">
            <Input id="rp-date" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="rp-notes" error={fe.notes}>
          <Textarea id="rp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["amount", "method", "kind", "reference", "paid_at", "notes"]} />
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------- pay from wallet */

export function WalletPayDialog({ order, onClose }: { order: OrderPayment | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const wallet = useQuery({
    queryKey: financeKeys.wallet(order?.customer.id ?? 0),
    queryFn: () => financeApi.wallets.get(order!.customer.id),
    enabled: Boolean(order),
  });
  const balance = wallet.data ? Number(wallet.data.wallet_balance) : null;
  const due = order?.figures.due !== null && order?.figures.due !== undefined ? Number(order.figures.due) : null;
  useEffect(() => {
    if (order) {
      setAmount("");
      setError(null);
      setLocal({});
    }
  }, [order]);
  useEffect(() => {
    if (balance !== null && due !== null) setAmount((a) => a || String(Math.min(balance, due) || ""));
  }, [balance, due]);

  const pay = useApiMutation((v: { order: number; amount: string }) => financeApi.payments.fromWallet(v), {
    invalidate: FINANCE_INVALIDATE,
    success: (p) => `${formatTSh(p.amount)} paid from wallet on ${p.order.reference}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!order) return;
    const n = parseAmount(amount);
    const errs: Record<string, string> = {};
    if (n === null || n <= 0) errs.amount = "Enter an amount greater than zero.";
    else if (balance !== null && n > balance) errs.amount = `The wallet only holds ${formatTSh(balance)}.`;
    else if (due !== null && n > due) errs.amount = `The balance is ${formatTSh(due)}.`;
    setLocal(errs);
    if (Object.keys(errs).length || n === null) return;
    pay.mutate({ order: order.id, amount: String(n) });
  };
  const fe = mergedErrors(error, local);
  if (!order) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pay from Wallet — ${order.reference}`}
      size="lg"
      footer={
        <DialogFooter label="Pay from Wallet" onSubmit={submit} onClose={onClose} pending={pay.isPending} disabled={!balance} />
      }
    >
      <div className="space-y-4">
        <OrderSummary order={order} />
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <span className="text-sm text-blue-800">{order.customer.full_name}&apos;s wallet</span>
          {wallet.isPending ? (
            <span className="h-5 w-24 animate-pulse rounded bg-blue-100" />
          ) : wallet.isError ? (
            <span className="text-sm text-red-600">{errorText(wallet.error)}</span>
          ) : (
            <span className="font-bold text-blue-900">{formatTSh(wallet.data.wallet_balance)}</span>
          )}
        </div>
        {balance === 0 && <p className="text-sm text-gray-600">The wallet is empty. Top it up under Wallets &amp; Installments.</p>}
        <Field label="Amount (TSh)" required htmlFor="wp-amount" error={fe.amount}>
          <Input id="wp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={Boolean(fe.amount)} disabled={!balance} />
        </Field>
        <FormAlert error={error} shown={["amount"]} />
      </div>
    </Modal>
  );
}
