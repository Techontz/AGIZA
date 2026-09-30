"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, PackageCheck, Truck, XCircle, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import { orderKeys } from "@/lib/api/services/orders";
import {
  returnKeys,
  returnsApi,
  type FinancialImpact,
  type ItemCondition,
  type RefundMethod,
  type ReturnRequest,
} from "@/lib/api/services/returns";
import { formatDateTime, formatTSh } from "@/lib/format";

import { IMPACT, OwnerBadge, useReturnAccess } from "./badges";

/** Closing a refund records a payment on the order. */
const INVALIDATE = [returnKeys.all, orderKeys.all];

export const CONDITIONS: [ItemCondition, string][] = [
  ["as_described", "As described / resellable"],
  ["damaged", "Damaged"],
  ["missing_parts", "Missing parts"],
  ["used", "Used / opened"],
];
const METHODS: [RefundMethod, string][] = [
  ["mobile_money", "Mobile Money"],
  ["bank_transfer", "Bank Transfer"],
  ["cash", "Cash"],
  ["card", "Card"],
  ["wallet", "Customer Wallet"],
  ["other", "Other"],
];

/* ------------------------------------------------------------ update status */

type Step = "in_transit" | "received" | "inspect" | "approve" | "reject" | "close";
const STEP: Record<Step, { label: string; icon: typeof Truck; hint: string }> = {
  in_transit: { label: "Mark In Transit", icon: Truck, hint: "The item is on its way back (Delivery)." },
  received: { label: "Mark Received", icon: PackageCheck, hint: "The item arrived at the warehouse." },
  inspect: { label: "Inspect Item", icon: ClipboardCheck, hint: "Record the item's condition." },
  approve: { label: "Approve Return", icon: CheckCircle2, hint: "Accept the return and set the outcome." },
  reject: { label: "Reject Return", icon: XCircle, hint: "Refuse the return; no refund is due." },
  close: { label: "Close Return", icon: Lock, hint: "Finish the return." },
};

/** Next workflow steps for a return, from `actions` and `allowed_transitions`. */
export function stepsFor(r: ReturnRequest): Step[] {
  const allowed = new Set(r.allowed_transitions.map((t) => t.value));
  const out: Step[] = [];
  if (r.actions.includes("transition")) {
    if (allowed.has("in_transit")) out.push("in_transit");
    if (allowed.has("received")) out.push("received");
  }
  if (r.actions.includes("inspect")) out.push("inspect");
  if (r.actions.includes("decide")) {
    if (r.status === "inspected") out.push("approve");
    out.push("reject");
  }
  if (r.actions.includes("close")) out.push("close");
  return out;
}

export function UpdateStatusDialog({ ret, open, onClose }: { ret: ReturnRequest; open: boolean; onClose: () => void }) {
  const { canRefund } = useReturnAccess();
  const steps = stepsFor(ret);
  const [step, setStep] = useState<Step | "">("");
  const [notes, setNotes] = useState("");
  const [condition, setCondition] = useState<ItemCondition | "">("");
  /** Put the returned units back in stock (defaults to "yes" when the item is resellable). */
  const [restock, setRestock] = useState(false);
  const [impact, setImpact] = useState<FinancialImpact>(ret.financial_impact);
  const [refund, setRefund] = useState("");
  const [method, setMethod] = useState<RefundMethod | "">("");
  const [reference, setReference] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setStep(steps[0] ?? "");
      setNotes("");
      setCondition("");
      setRestock(false);
      setImpact(ret.financial_impact);
      setRefund(ret.refund_amount ?? ret.return_value ?? "");
      setMethod("");
      setReference("");
      setConfirmReject(false);
      setError(null);
      setLocal({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // The return may refresh while the dialog is open (e.g. reopened right after a
  // status change): never keep a step that is no longer allowed.
  const stepsKey = steps.join();
  useEffect(() => {
    if (open && step && !steps.includes(step)) setStep(steps[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepsKey]);

  const refundDue = ret.status === "approved" && ret.financial_impact === "refund_required";
  // Restocking needs the returned order lines (customer requests, returns opened from an order's items).
  const canRestock = ret.lines.length > 0 && !ret.restocked;
  const mutation = useApiMutation(
    (s: Step): Promise<ReturnRequest> => {
      switch (s) {
        case "in_transit":
        case "received":
          return returnsApi.transition(ret.id, { status: s, note: notes });
        case "inspect":
          return returnsApi.inspect(ret.id, {
            item_condition: condition as ItemCondition,
            notes,
            financial_impact: impact,
            ...(canRestock ? { restock } : {}),
          });
        case "approve":
          return returnsApi.decide(ret.id, {
            approve: true,
            notes,
            financial_impact: impact,
            refund_amount: impact === "refund_required" && refund ? refund : null,
          });
        case "reject":
          return returnsApi.decide(ret.id, { approve: false, notes });
        case "close":
          return returnsApi.close(ret.id, {
            notes,
            ...(refundDue ? { refund_method: method || null, refund_reference: reference.trim() } : {}),
          });
      }
    },
    {
      invalidate: INVALIDATE,
      success: (r) => `${r.reference}: ${r.status_display}`,
      onSuccess: () => {
        setConfirmReject(false);
        onClose();
      },
      onError: (e) => {
        setConfirmReject(false);
        setError(e);
      },
    },
  );

  const submit = () => {
    if (!step) return;
    const errs: Record<string, string> = {};
    if (step === "inspect" && !condition) errs.item_condition = "Choose the item's condition.";
    if (["inspect", "approve", "reject"].includes(step) && !notes.trim())
      errs.notes = step === "inspect" ? "Record the inspection findings." : "Give the reason for the decision.";
    if (step === "approve" && impact === "refund_required" && !(Number(refund) > 0)) errs.refund_amount = "Enter the refund amount.";
    if (step === "close" && refundDue && !method) errs.refund_method = "Choose how the refund was paid.";
    setLocal(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    if (step === "reject") return setConfirmReject(true);
    mutation.mutate(step);
  };
  const fe = mergedErrors(error, local);
  const blocked = step === "close" && refundDue && !canRefund;
  const notesRequired = step === "inspect" || step === "approve" || step === "reject";

  return (
    <>
      <Modal
        open={open && !confirmReject}
        onClose={onClose}
        title={`Update Status — ${ret.reference}`}
        size="xl"
        footer={
          <>
            <Button
              className="flex-1"
              variant={step === "reject" ? "danger" : step === "approve" ? "success" : "primary"}
              onClick={submit}
              loading={mutation.isPending}
              disabled={!step || blocked}
            >
              {step ? STEP[step].label : "Update Status"}
            </Button>
            <Button variant="muted" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Current status: <strong>{ret.status_display}</strong> · Owner: <strong>{ret.owner_display}</strong>
          </p>
          {steps.length === 0 ? (
            <p className="text-sm text-gray-500">No further steps are possible from here.</p>
          ) : (
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 mb-2">Next step</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {steps.map((s) => {
                  const { label, icon: Icon, hint } = STEP[s];
                  return (
                    <label
                      key={s}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                        step === s ? (s === "reject" ? "border-red-600 bg-red-50" : "border-blue-600 bg-blue-50") : "border-gray-200 hover:border-gray-300",
                      )}
                    >
                      <input type="radio" name="return-step" value={s} checked={step === s} onChange={() => { setStep(s); setLocal({}); setError(null); }} className="sr-only" />
                      <Icon className={cn("size-5 mt-0.5 flex-shrink-0", s === "reject" ? "text-red-600" : "text-blue-600")} />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{label}</span>
                        <span className="block text-xs text-gray-500">{hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === "inspect" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Item condition" required htmlFor="rs-cond" error={fe.item_condition}>
                <Select
                  id="rs-cond"
                  value={condition}
                  onChange={(e) => {
                    const c = e.target.value as ItemCondition | "";
                    setCondition(c);
                    setRestock(c === "as_described");
                  }}
                >
                  <option value="">Select condition</option>
                  {CONDITIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <ImpactSelect id="rs-impact" value={impact} onChange={setImpact} error={fe.financial_impact} />
              {canRestock && (
                <label className="sm:col-span-2 flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={restock}
                    onChange={(e) => setRestock(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Put items back in stock</span>
                    <span className="block text-xs text-gray-500">
                      {ret.lines.reduce((n, l) => n + l.quantity, 0)} returned unit(s) become sellable again at the warehouse they were sold from.
                    </span>
                  </span>
                </label>
              )}
              {ret.restocked && <p className="sm:col-span-2 text-xs text-green-700">The returned items are already back in stock.</p>}
            </div>
          )}

          {step === "approve" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ImpactSelect id="rs-impact" value={impact} onChange={setImpact} error={fe.financial_impact} />
              {impact === "refund_required" && (
                <Field label="Refund amount (TSh)" required htmlFor="rs-refund" error={fe.refund_amount} hint={ret.return_value ? `Return value: ${formatTSh(ret.return_value)}` : undefined}>
                  <Input id="rs-refund" type="number" min="0" step="1000" value={refund} onChange={(e) => setRefund(e.target.value)} invalid={Boolean(fe.refund_amount)} />
                </Field>
              )}
            </div>
          )}

          {step === "close" && refundDue && (
            <div className="space-y-3">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                Closing pays out the approved refund of <strong>{formatTSh(ret.refund_amount)}</strong> and records it on {ret.order.reference}.
              </div>
              {blocked ? (
                <p className="text-sm text-red-600" role="alert">
                  Paying out a refund requires Finance edit or Returns manage access.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Refund method" required htmlFor="rs-method" error={fe.refund_method}>
                    <Select id="rs-method" value={method} onChange={(e) => setMethod(e.target.value as RefundMethod | "")}>
                      <option value="">Select method</option>
                      {METHODS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Transaction reference" htmlFor="rs-ref" error={fe.refund_reference}>
                    <Input id="rs-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MPESA QFT7X2" />
                  </Field>
                </div>
              )}
            </div>
          )}

          {step && (
            <Field
              label={step === "inspect" ? "Inspection notes" : notesRequired ? "Decision notes" : "Note (optional)"}
              required={notesRequired}
              htmlFor="rs-notes"
              error={fe.notes ?? fe.note}
            >
              <Textarea id="rs-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add context for the history..." />
            </Field>
          )}
          <FormAlert error={error} shown={["notes", "note", "item_condition", "financial_impact", "refund_amount", "refund_method", "refund_reference"]} />
        </div>
      </Modal>
      <ConfirmDialog
        open={open && confirmReject}
        title={`Reject ${ret.reference}?`}
        message={<>The return is rejected and no refund is due. It then only needs closing.</>}
        confirmLabel="Reject Return"
        tone="danger"
        pending={mutation.isPending}
        onConfirm={() => mutation.mutate("reject")}
        onClose={() => setConfirmReject(false)}
      />
    </>
  );
}

function ImpactSelect({ id, value, onChange, error }: { id: string; value: FinancialImpact; onChange: (v: FinancialImpact) => void; error?: string }) {
  return (
    <Field label="Financial impact" htmlFor={id} error={error}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as FinancialImpact)}>
        {Object.entries(IMPACT).map(([v, [, l]]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/* ----------------------------------------------------------- message customer */

export function MessageCustomerDialog({ ret, open, onClose }: { ret: ReturnRequest; open: boolean; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setMessage("");
      setError(null);
      setLocal({});
    }
  }, [open]);
  const send = useApiMutation(() => returnsApi.message(ret.id, { message: message.trim() }), {
    invalidate: [returnKeys.all],
    success: (r) => `Message sent to ${r.customer.full_name}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!message.trim()) return setLocal({ message: "Write the message." });
    setLocal({});
    send.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Message Customer — ${ret.reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={send.isPending}>
            Send Message
          </Button>
          <Button variant="muted" onClick={onClose} disabled={send.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {ret.customer.full_name} sees this on the return in their account and gets a notification. It replaces the previous message.
        </p>
        {ret.customer_message && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Current message</p>
            <p className="text-sm text-gray-800 whitespace-pre-line">{ret.customer_message}</p>
          </div>
        )}
        <Field label="Message" required htmlFor="rm-message" error={fe.message}>
          <Textarea
            id="rm-message"
            rows={4}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Our rider will collect the item on Friday between 10:00 and 14:00."
          />
        </Field>
        <FormAlert error={error} shown={["message"]} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- reassign */

export function ReassignDialog({ ret, open, onClose }: { ret: ReturnRequest; open: boolean; onClose: () => void }) {
  const handlers = useQuery({ queryKey: returnKeys.handlers, queryFn: returnsApi.handlers, enabled: open, staleTime: 60_000 });
  const [handler, setHandler] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setHandler(ret.handler ? String(ret.handler.id) : "");
      setNote("");
      setError(null);
      setLocal({});
    }
  }, [open, ret.handler]);
  const reassign = useApiMutation(() => returnsApi.reassign(ret.id, { handler: Number(handler), note }), {
    invalidate: [returnKeys.all],
    success: (r) => `${r.reference} reassigned to ${r.handler?.full_name ?? ""}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!handler) return setLocal({ handler: "Choose a handler." });
    if (ret.handler && Number(handler) === ret.handler.id) return setLocal({ handler: "Choose a different handler." });
    setLocal({});
    reassign.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reassign Handler — ${ret.reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={reassign.isPending}>
            Reassign
          </Button>
          <Button variant="muted" onClick={onClose} disabled={reassign.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Current handler: <strong>{ret.handler ? `${ret.handler.full_name} (${ret.handler.role})` : "Unassigned"}</strong>
        </p>
        <Field label="New handler" required htmlFor="rr-handler" error={fe.handler}>
          <Select id="rr-handler" value={handler} onChange={(e) => setHandler(e.target.value)} disabled={handlers.isPending}>
            <option value="">{handlers.isPending ? "Loading staff…" : "Select a handler"}</option>
            {handlers.data?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.full_name} — {h.role}
              </option>
            ))}
          </Select>
        </Field>
        {handlers.isError && <p className="text-sm text-red-600">{errorText(handlers.error)}</p>}
        <Field label="Note (optional)" htmlFor="rr-note" error={fe.note}>
          <Textarea id="rr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormAlert error={error} shown={["handler", "note"]} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ history */

export function HistoryDialog({ ret, open, onClose }: { ret: ReturnRequest; open: boolean; onClose: () => void }) {
  const history = useQuery({ queryKey: returnKeys.history(ret.id), queryFn: () => returnsApi.history(ret.id), enabled: open });
  return (
    <Modal open={open} onClose={onClose} title={`History — ${ret.reference}`} footer={<Button variant="muted" className="ml-auto" onClick={onClose}>Close</Button>}>
      {history.isPending ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : history.isError ? (
        <div className="text-center py-6" role="alert">
          <p className="text-sm text-red-600">{errorText(history.error)}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => history.refetch()}>
            Try again
          </Button>
        </div>
      ) : history.data.length === 0 ? (
        <p className="text-sm text-gray-500">No history yet.</p>
      ) : (
        <ol className="space-y-3">
          {history.data.map((h, index) => (
            <li key={h.id} className="flex gap-4 p-3 bg-gray-50 rounded-lg">
              <div className="size-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{index + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900">
                    {h.from_status === h.to_status ? "Update" : `${h.from_status_display ? `${h.from_status_display} → ` : ""}${h.to_status_display ?? h.to_status}`}
                  </span>
                  <OwnerBadge owner={h.owner} label={h.owner_display} />
                </div>
                <p className="text-sm text-gray-600">
                  {formatDateTime(h.created_at)} · by {h.changed_by?.full_name ?? "System"}
                </p>
                {h.note && <p className="text-sm text-gray-700 mt-1 italic break-words">{h.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
