"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { OrderPicker, type PickedOrder } from "@/components/deliveries/order-picker";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import {
  returnKeys,
  returnsApi,
  type FinancialImpact,
  type ReasonCode,
  type ReturnExceptionFlag,
  type ReturnRequest,
  type ReturnType,
} from "@/lib/api/services/returns";

import { IMPACT, REASON, RETURN_EXCEPTION, RETURN_TYPE, SYSTEM_RETURN_TYPES } from "./badges";

type Values = {
  return_type: ReturnType | "";
  reason_code: ReasonCode | "";
  item_details: string;
  return_value: string;
  financial_impact: FinancialImpact | "";
  handler: string;
  exception_flag: ReturnExceptionFlag | "";
  notes: string;
};
const EMPTY: Values = {
  return_type: "",
  reason_code: "",
  item_details: "",
  return_value: "",
  financial_impact: "",
  handler: "",
  exception_flag: "",
  notes: "",
};
const SHOWN = ["order", ...Object.keys(EMPTY)];

/** "New Return" for any order. */
export function NewReturnDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: ReturnRequest) => void }) {
  const handlers = useQuery({ queryKey: returnKeys.handlers, queryFn: returnsApi.handlers, enabled: open, staleTime: 60_000 });
  const [order, setOrder] = useState<PickedOrder | null>(null);
  const [v, setV] = useState<Values>(EMPTY);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setOrder(null);
      setV(EMPTY);
      setError(null);
      setLocal({});
    }
  }, [open]);

  const pick = (o: PickedOrder | null) => {
    setOrder(o);
    if (o) {
      setV((p) => ({
        ...p,
        item_details: p.item_details || o.item_details,
        return_value: p.return_value || (o.total_amount ? String(Number(o.total_amount)) : ""),
      }));
    }
  };
  const set = <K extends keyof Values>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value as Values[K] }));

  const create = useApiMutation(
    () =>
      returnsApi.create({
        order: order!.id,
        return_type: v.return_type as ReturnType,
        reason_code: v.reason_code as ReasonCode,
        item_details: v.item_details.trim(),
        return_value: v.return_value || null,
        ...(v.financial_impact ? { financial_impact: v.financial_impact } : {}),
        handler: v.handler ? Number(v.handler) : null,
        exception_flag: v.exception_flag,
        notes: v.notes,
      }),
    {
      invalidate: [returnKeys.all],
      success: (r) => `Return ${r.reference} opened for ${r.order.reference}`,
      onSuccess: (r) => {
        onClose();
        onCreated(r);
      },
      onError: setError,
    },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!order) errs.order = "Choose the order being returned.";
    if (!v.return_type) errs.return_type = "Choose the return type.";
    if (!v.reason_code) errs.reason_code = "Choose the reason.";
    if (v.return_value && Number(v.return_value) < 0) errs.return_value = "The value can't be negative.";
    setLocal(errs);
    if (Object.keys(errs).length === 0) create.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Return"
      size="3xl"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={create.isPending}>
            Create Return
          </Button>
          <Button variant="muted" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Order" required htmlFor="nr-order">
          <OrderPicker id="nr-order" value={order} onChange={pick} kinds={["international", "express", "equipment"]} error={fe.order} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Return type" required htmlFor="nr-type" error={fe.return_type}>
            <Select id="nr-type" value={v.return_type} onChange={set("return_type")}>
              <option value="">Select type</option>
              {Object.entries(RETURN_TYPE).filter(([k]) => !SYSTEM_RETURN_TYPES.includes(k as ReturnType)).map(([k, [, l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" required htmlFor="nr-reason" error={fe.reason_code}>
            <Select id="nr-reason" value={v.reason_code} onChange={set("reason_code")}>
              <option value="">Select reason</option>
              {Object.entries(REASON).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Item" htmlFor="nr-item" error={fe.item_details} hint="Defaults to the order's items.">
          <Input id="nr-item" value={v.item_details} onChange={set("item_details")} maxLength={255} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Return value (TSh)" htmlFor="nr-value" error={fe.return_value} hint="Items worth TSh 1,000,000 or more are flagged High-Value.">
            <Input id="nr-value" type="number" min="0" step="1000" value={v.return_value} onChange={set("return_value")} invalid={Boolean(fe.return_value)} />
          </Field>
          <Field label="Financial impact" htmlFor="nr-impact" error={fe.financial_impact}>
            <Select id="nr-impact" value={v.financial_impact} onChange={set("financial_impact")}>
              <option value="">Automatic (from return type)</option>
              {Object.entries(IMPACT).map(([k, [, l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Handler" htmlFor="nr-handler" error={fe.handler}>
            <Select id="nr-handler" value={v.handler} onChange={set("handler")}>
              <option value="">{handlers.isPending ? "Loading staff…" : "Assign later"}</option>
              {handlers.data?.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name} — {h.role}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Exception flag" htmlFor="nr-flag" error={fe.exception_flag}>
            <Select id="nr-flag" value={v.exception_flag} onChange={set("exception_flag")}>
              <option value="">None</option>
              {Object.entries(RETURN_EXCEPTION).map(([k, [, l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="nr-notes" error={fe.notes}>
          <Textarea id="nr-notes" rows={3} value={v.notes} onChange={set("notes")} placeholder="What did the customer report?" />
        </Field>
        <FormAlert error={error} shown={SHOWN} />
      </div>
    </Modal>
  );
}
