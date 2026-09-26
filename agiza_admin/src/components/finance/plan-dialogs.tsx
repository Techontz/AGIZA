"use client";

import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { financeApi, type InstallmentPlan, type OrderPayment } from "@/lib/api/services/finance";
import { formatTSh } from "@/lib/format";

import { FinanceOrderPicker } from "./order-picker";
import { DialogFooter, FINANCE_INVALIDATE, FormAlert, addDays, formatDay, mergedErrors, todayInput } from "./shared";

/** Same split as the API: equal parts rounded down to the cent, the last one takes the remainder. */
function split(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents - base * (n - 1) : base) / 100);
}

/* ------------------------------------------------------------ create plan */

export function CreatePlanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [order, setOrder] = useState<OrderPayment | null>(null);
  const [count, setCount] = useState("3");
  const [first, setFirst] = useState("");
  const [intervalDays, setIntervalDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setOrder(null);
      setCount("3");
      setFirst(addDays(todayInput(), 30));
      setIntervalDays("30");
      setNotes("");
      setError(null);
      setLocal({});
    }
  }, [open]);

  const create = useApiMutation((v: Parameters<typeof financeApi.plans.create>[0]) => financeApi.plans.create(v), {
    invalidate: FINANCE_INVALIDATE,
    success: (p) => `Installment plan for ${p.order.reference} ${p.status === "active" ? "is active" : "sent for approval"}`,
    onSuccess: onClose,
    onError: setError,
  });

  const n = Number(count);
  const days = Number(intervalDays);
  const due = order?.figures.due ? Number(order.figures.due) : 0;
  const valid = Number.isInteger(n) && n >= 1 && n <= 24 && Number.isInteger(days) && days >= 1 && days <= 365 && Boolean(first);
  const preview = order && due > 0 && valid ? split(due, n) : [];

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!order) errs.order = "Choose an order.";
    else if (!(due > 0)) errs.order = `${order.reference} has nothing left to pay.`;
    if (!Number.isInteger(n) || n < 1 || n > 24) errs.number_of_installments = "Choose between 1 and 24 installments.";
    if (!Number.isInteger(days) || days < 1 || days > 365) errs.interval_days = "Between 1 and 365 days.";
    if (!first) errs.first_due_date = "Choose the first due date.";
    else if (first < todayInput()) errs.first_due_date = "The first due date can't be in the past.";
    setLocal(errs);
    if (Object.keys(errs).length || !order) return;
    create.mutate({ order: order.id, number_of_installments: n, first_due_date: first, interval_days: days, notes: notes.trim() });
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Installment Plan"
      size="2xl"
      footer={<DialogFooter label="Create Plan" onSubmit={submit} onClose={onClose} pending={create.isPending} />}
    >
      <div className="space-y-4">
        <Field label="Order" required htmlFor="ip-order">
          <FinanceOrderPicker id="ip-order" value={order} onChange={setOrder} dueOnly error={fe.order} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Installments" required htmlFor="ip-count" error={fe.number_of_installments} hint="1 – 24">
            <Input id="ip-count" type="number" min={1} max={24} value={count} onChange={(e) => setCount(e.target.value)} invalid={Boolean(fe.number_of_installments)} />
          </Field>
          <Field label="First Due Date" required htmlFor="ip-first" error={fe.first_due_date}>
            <Input id="ip-first" type="date" min={todayInput()} value={first} onChange={(e) => setFirst(e.target.value)} invalid={Boolean(fe.first_due_date)} />
          </Field>
          <Field label="Every (days)" required htmlFor="ip-interval" error={fe.interval_days}>
            <Input id="ip-interval" type="number" min={1} max={365} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} invalid={Boolean(fe.interval_days)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="ip-notes" error={fe.notes}>
          <Textarea id="ip-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agreement with the customer..." />
        </Field>

        {preview.length > 0 && (
          <div className="border border-gray-200 rounded-lg" aria-live="polite">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-semibold text-gray-900">Schedule preview</span>
              <span className="text-gray-600">Balance {formatTSh(due)} in {n} payment{n === 1 ? "" : "s"}</span>
            </div>
            <ol className="divide-y divide-gray-100 max-h-56 overflow-y-auto text-sm">
              {preview.map((amount, i) => (
                <li key={i} className="px-4 py-2 flex justify-between gap-3">
                  <span className="text-gray-700">
                    #{i + 1} · {formatDay(addDays(first, days * i))}
                  </span>
                  <span className="font-semibold text-gray-900">{formatTSh(amount)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-xs text-gray-500">
          Plans need Finance approval unless installments were already allowed for the order. Payments are applied to the earliest unpaid installment.
        </p>
        <FormAlert error={error} shown={["order", "number_of_installments", "first_due_date", "interval_days", "notes"]} />
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- decide */

export function DecidePlanDialog({
  plan,
  approve,
  onClose,
}: {
  plan: InstallmentPlan | null;
  approve: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState("");
  useEffect(() => {
    if (plan) {
      setNote("");
      setError(null);
      setLocal("");
    }
  }, [plan, approve]);
  const decide = useApiMutation(() => financeApi.plans.decide(plan!.id, { approve, note: note.trim() }), {
    invalidate: FINANCE_INVALIDATE,
    success: (p) => `Plan for ${p.order.reference} ${approve ? "approved" : "rejected"}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!approve && !note.trim()) return setLocal("Give the reason for rejecting the plan.");
    setLocal("");
    decide.mutate(undefined);
  };
  if (!plan) return null;
  const fe = mergedErrors(error, local ? { note: local } : {});

  return (
    <ConfirmDialog
      open
      title={`${approve ? "Approve" : "Reject"} plan — ${plan.order.reference}`}
      message={
        approve
          ? `Approve ${plan.number_of_installments} installment${plan.number_of_installments === 1 ? "" : "s"} totalling ${formatTSh(plan.total_amount)} for ${plan.customer.full_name}? The order may then proceed on installments.`
          : `Reject the installment plan for ${plan.customer.full_name}? The order will need to be paid in full.`
      }
      confirmLabel={approve ? "Approve Plan" : "Reject Plan"}
      tone={approve ? "success" : "danger"}
      pending={decide.isPending}
      onConfirm={submit}
      onClose={onClose}
    >
      <div className="mt-4 space-y-3">
        <Field label={approve ? "Note (optional)" : "Reason"} required={!approve} htmlFor="ip-decide-note" error={fe.note}>
          <Textarea id="ip-decide-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["note"]} />
      </div>
    </ConfirmDialog>
  );
}
