"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { orderKeys } from "@/lib/api/services/orders";
import {
  EXCEPTION_FLAGS,
  procurementApi,
  procurementKeys,
  suppliersApi,
  type ExceptionFlag,
  type ProcurementOrder,
  type ProcurementUpdate,
} from "@/lib/api/services/procurement";
import { taskKeys } from "@/lib/api/services/tasks";
import { formatTSh } from "@/lib/format";

/** Every procurement change can move the linked order (and its tasks). */
const INVALIDATE = [procurementKeys.all, orderKeys.all, taskKeys.all];

const num = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

function useFormErrors(open: boolean) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setErrors({});
  }, [open]);
  const onError = (e: unknown) => {
    setErrors(fieldErrors(e));
    toast.error(errorText(e));
  };
  return { errors, setErrors, onError };
}

/* -------------------------------------------------------- select supplier */

export function SelectSupplierDialog({ proc, open, onClose }: { proc: ProcurementOrder; open: boolean; onClose: () => void }) {
  const suppliers = useQuery({
    queryKey: procurementKeys.suppliers({ is_active: true, page_size: 100 }),
    queryFn: () => suppliersApi.list({ is_active: true, page_size: 100, ordering: "name" }),
    enabled: open,
  });
  const [v, setV] = useState<Record<string, string>>({});
  const { errors, setErrors, onError } = useFormErrors(open);
  useEffect(() => {
    if (open)
      setV({
        supplier: proc.supplier ? String(proc.supplier.id) : "",
        quantity: String(proc.quantity),
        unit_cost: num(proc.unit_cost),
        item_cost: num(proc.item_cost),
        expected_at_cargo: proc.expected_at_cargo ?? "",
        supplier_order_number: proc.supplier_order_number,
        note: "",
      });
  }, [open, proc]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  const save = useApiMutation(
    () =>
      procurementApi.selectSupplier(proc.id, {
        supplier: Number(v.supplier),
        quantity: v.quantity ? Number(v.quantity) : undefined,
        unit_cost: v.unit_cost || undefined,
        item_cost: v.item_cost || undefined,
        expected_at_cargo: v.expected_at_cargo || undefined,
        supplier_order_number: v.supplier_order_number,
        note: v.note,
      }),
    { invalidate: INVALIDATE, success: (r) => `${r.order.reference}: supplier ${r.supplier?.name ?? ""} selected`, onSuccess: onClose, onError },
  );
  const submit = () => {
    if (!v.supplier) return setErrors({ supplier: "Choose a supplier." });
    save.mutate(undefined);
  };
  const changing = proc.status === "supplier_selected";
  const options = suppliers.data?.results ?? [];
  const current = proc.supplier && !options.some((s) => s.id === proc.supplier?.id) ? proc.supplier : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={changing ? "Change Supplier" : "Select Supplier"}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={save.isPending}>
            {changing ? "Change Supplier" : "Select Supplier"}
          </Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Supplier" required htmlFor="ps-supplier" error={errors.supplier} hint={suppliers.isPending ? "Loading suppliers…" : options.length === 0 ? "No active suppliers yet. Add one under Suppliers." : undefined}>
          <Select id="ps-supplier" value={v.supplier ?? ""} onChange={set("supplier")} disabled={suppliers.isPending}>
            <option value="">Select supplier...</option>
            {current && <option value={current.id}>{current.name} (inactive)</option>}
            {options.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.country_detail.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Quantity" htmlFor="ps-qty" error={errors.quantity}>
            <Input id="ps-qty" type="number" min="1" value={v.quantity ?? ""} onChange={set("quantity")} />
          </Field>
          <Field label="Unit Cost (TSh)" htmlFor="ps-unit" error={errors.unit_cost}>
            <Input id="ps-unit" type="number" min="0" value={v.unit_cost ?? ""} onChange={set("unit_cost")} />
          </Field>
          <Field label="Item Cost (TSh)" htmlFor="ps-cost" error={errors.item_cost} hint="Blank = unit cost × quantity">
            <Input id="ps-cost" type="number" min="0" value={v.item_cost ?? ""} onChange={set("item_cost")} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Expected to Cargo" htmlFor="ps-eta" error={errors.expected_at_cargo}>
            <Input id="ps-eta" type="date" value={v.expected_at_cargo ?? ""} onChange={set("expected_at_cargo")} />
          </Field>
          <Field label="Supplier Order / Invoice #" htmlFor="ps-po" error={errors.supplier_order_number}>
            <Input id="ps-po" value={v.supplier_order_number ?? ""} onChange={set("supplier_order_number")} />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="ps-note" error={errors.note}>
          <Textarea id="ps-note" rows={2} value={v.note ?? ""} onChange={set("note")} placeholder="Why this supplier..." />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- mark paid */

export function MarkPaidDialog({ proc, open, onClose }: { proc: ProcurementOrder; open: boolean; onClose: () => void }) {
  const [v, setV] = useState<Record<string, string>>({});
  const { errors, onError } = useFormErrors(open);
  useEffect(() => {
    if (open) setV({ payment_reference: "", paid_at: "", note: "" });
  }, [open]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const save = useApiMutation(
    () =>
      procurementApi.markPaid(proc.id, {
        payment_reference: v.payment_reference,
        paid_at: v.paid_at ? new Date(v.paid_at).toISOString() : undefined,
        note: v.note,
      }),
    { invalidate: INVALIDATE, success: (r) => `${r.order.reference}: supplier marked as paid`, onSuccess: onClose, onError },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark Supplier Paid"
      size="lg"
      footer={
        <>
          <Button variant="success" className="flex-1" onClick={() => save.mutate(undefined)} loading={save.isPending}>Mark as Paid</Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-900">
          Paying <strong>{proc.supplier?.name}</strong> {formatTSh(proc.item_cost)} for {proc.order.reference}.
          The order moves to Paid Supplier. Once the supplier ships, record it with the tracking number so the goods
          are expected at cargo.
        </div>
        {errors.item_cost && <p className="text-sm text-red-600">{errors.item_cost}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Payment Reference" htmlFor="mp-ref" error={errors.payment_reference}>
            <Input id="mp-ref" value={v.payment_reference ?? ""} onChange={set("payment_reference")} placeholder="e.g. TT-2026-0142" />
          </Field>
          <Field label="Paid At" htmlFor="mp-at" error={errors.paid_at} hint="Blank = now">
            <Input id="mp-at" type="datetime-local" value={v.paid_at ?? ""} onChange={set("paid_at")} />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="mp-note" error={errors.note}>
          <Textarea id="mp-note" rows={2} value={v.note ?? ""} onChange={set("note")} />
        </Field>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- mark shipped */

export function MarkShippedDialog({ proc, open, onClose }: { proc: ProcurementOrder; open: boolean; onClose: () => void }) {
  const [v, setV] = useState<Record<string, string>>({});
  const { errors, setErrors, onError } = useFormErrors(open);
  useEffect(() => {
    if (open)
      setV({
        supplier_tracking_number: proc.supplier_tracking_number,
        shipped_at: "",
        expected_at_cargo: proc.expected_at_cargo ?? "",
        note: "",
      });
  }, [open, proc]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const save = useApiMutation(
    () =>
      procurementApi.markShipped(proc.id, {
        supplier_tracking_number: (v.supplier_tracking_number ?? "").trim(),
        shipped_at: v.shipped_at ? new Date(v.shipped_at).toISOString() : undefined,
        expected_at_cargo: v.expected_at_cargo || null,
        note: v.note,
      }),
    { invalidate: INVALIDATE, success: (r) => `${r.order.reference}: supplier shipped — waiting to receive at cargo`, onSuccess: onClose, onError },
  );
  const submit = () => {
    if (!v.supplier_tracking_number?.trim()) return setErrors({ supplier_tracking_number: "Enter the tracking number." });
    save.mutate(undefined);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Supplier Shipped"
      size="lg"
      footer={
        <>
          <Button variant="success" className="flex-1" onClick={submit} loading={save.isPending}>Mark as Shipped</Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-900">
          <strong>{proc.supplier?.name}</strong> shipped {proc.order.reference} to the consolidation warehouse. The order moves to
          Waiting to Receive and the parcel appears in Shipping.
        </div>
        <Field label="Supplier Tracking #" required htmlFor="sh-track" error={errors.supplier_tracking_number}>
          <Input id="sh-track" value={v.supplier_tracking_number ?? ""} onChange={set("supplier_tracking_number")} placeholder="e.g. SF1234567890" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Shipped At" htmlFor="sh-at" error={errors.shipped_at} hint="Blank = now">
            <Input id="sh-at" type="datetime-local" value={v.shipped_at ?? ""} onChange={set("shipped_at")} />
          </Field>
          <Field label="Expected to Cargo" htmlFor="sh-eta" error={errors.expected_at_cargo}>
            <Input id="sh-eta" type="date" value={v.expected_at_cargo ?? ""} onChange={set("expected_at_cargo")} />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="sh-note" error={errors.note}>
          <Textarea id="sh-note" rows={2} value={v.note ?? ""} onChange={set("note")} />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------- cancel supplier */

export function CancelSupplierDialog({ proc, open, onClose }: { proc: ProcurementOrder; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { errors, setErrors, onError } = useFormErrors(open);
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const save = useApiMutation(() => procurementApi.cancelSupplier(proc.id, reason.trim()), {
    invalidate: INVALIDATE,
    success: (r) => `${r.order.reference}: supplier cancelled`,
    onSuccess: onClose,
    onError,
  });
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Supplier Cancelled"
      tone="danger"
      confirmLabel="Mark Supplier Cancelled"
      pending={save.isPending}
      onConfirm={() => (reason.trim() ? save.mutate(undefined) : setErrors({ reason: "Give a reason." }))}
      message={
        <p className="text-sm">
          Record that <strong>{proc.supplier?.name ?? "the supplier"}</strong> cancelled {proc.order.reference}. A new supplier will
          have to be selected.
          {proc.status !== "supplier_selected" && (
            <>
              {" "}The order goes back to Supplier Confirmed, the expected parcel is withdrawn and this supplier order&apos;s payment
              and tracking details are cleared (they stay in the history).
            </>
          )}
        </p>
      }
    >
      <div className="mt-4">
        <Field label="Reason" required htmlFor="cs-reason" error={errors.reason}>
          <Textarea id="cs-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of stock, failed to ship, refunded in full" />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

/* ------------------------------------------------------------------- edit */

export function EditProcurementDialog({ proc, open, onClose }: { proc: ProcurementOrder; open: boolean; onClose: () => void }) {
  const operators = useQuery({ queryKey: procurementKeys.operators, queryFn: procurementApi.operators, enabled: open });
  const costsLocked = proc.status === "paid" || proc.status === "supplier_shipped" || proc.status === "received_at_cargo";
  const [v, setV] = useState<Record<string, string>>({});
  const { errors, onError } = useFormErrors(open);
  useEffect(() => {
    if (open)
      setV({
        operator: proc.operator ? String(proc.operator.id) : "",
        exception_flag: proc.exception_flag,
        expected_at_cargo: proc.expected_at_cargo ?? "",
        supplier_tracking_number: proc.supplier_tracking_number,
        supplier_order_number: proc.supplier_order_number,
        quantity: String(proc.quantity),
        unit_cost: num(proc.unit_cost),
        item_cost: num(proc.item_cost),
        notes: proc.notes,
      });
  }, [open, proc]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  const save = useApiMutation(
    () => {
      const data: ProcurementUpdate = {
        operator: v.operator ? Number(v.operator) : null,
        exception_flag: v.exception_flag as ExceptionFlag,
        expected_at_cargo: v.expected_at_cargo || null,
        supplier_tracking_number: v.supplier_tracking_number,
        supplier_order_number: v.supplier_order_number,
        notes: v.notes,
      };
      if (!costsLocked) {
        if (v.quantity) data.quantity = Number(v.quantity);
        data.unit_cost = v.unit_cost || null;
        data.item_cost = v.item_cost || null;
      }
      return procurementApi.update(proc.id, data);
    },
    { invalidate: INVALIDATE, success: (r) => `${r.order.reference} updated`, onSuccess: onClose, onError },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${proc.order.reference}`}
      size="xl"
      footer={
        <>
          <Button className="flex-1" onClick={() => save.mutate(undefined)} loading={save.isPending}>Save Changes</Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Assigned Operator" htmlFor="pe-op" error={errors.operator}>
            <Select id="pe-op" value={v.operator ?? ""} onChange={set("operator")}>
              <option value="">Unassigned</option>
              {proc.operator && !operators.data?.some((o) => o.id === proc.operator?.id) && (
                <option value={proc.operator.id}>{proc.operator.full_name}</option>
              )}
              {operators.data?.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Exception Flag" htmlFor="pe-flag" error={errors.exception_flag}>
            <Select id="pe-flag" value={v.exception_flag ?? ""} onChange={set("exception_flag")}>
              <option value="">No Issues</option>
              {Object.entries(EXCEPTION_FLAGS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Expected to Cargo" htmlFor="pe-eta" error={errors.expected_at_cargo}>
            <Input id="pe-eta" type="date" value={v.expected_at_cargo ?? ""} onChange={set("expected_at_cargo")} />
          </Field>
          <Field label="Supplier Tracking #" htmlFor="pe-track" error={errors.supplier_tracking_number}>
            <Input id="pe-track" value={v.supplier_tracking_number ?? ""} onChange={set("supplier_tracking_number")} />
          </Field>
          <Field label="Supplier Order / Invoice #" htmlFor="pe-po" error={errors.supplier_order_number}>
            <Input id="pe-po" value={v.supplier_order_number ?? ""} onChange={set("supplier_order_number")} />
          </Field>
          <Field label="Quantity" htmlFor="pe-qty" error={errors.quantity}>
            <Input id="pe-qty" type="number" min="1" value={v.quantity ?? ""} onChange={set("quantity")} disabled={costsLocked} />
          </Field>
          <Field label="Unit Cost (TSh)" htmlFor="pe-unit" error={errors.unit_cost}>
            <Input id="pe-unit" type="number" min="0" value={v.unit_cost ?? ""} onChange={set("unit_cost")} disabled={costsLocked} />
          </Field>
          <Field label="Item Cost (TSh)" htmlFor="pe-cost" error={errors.item_cost}>
            <Input id="pe-cost" type="number" min="0" value={v.item_cost ?? ""} onChange={set("item_cost")} disabled={costsLocked} />
          </Field>
        </div>
        {costsLocked && <p className="text-xs text-gray-500">Costs and quantity are locked once the supplier has been paid.</p>}
        <Field label="Notes" htmlFor="pe-notes" error={errors.notes}>
          <Textarea id="pe-notes" rows={3} value={v.notes ?? ""} onChange={set("notes")} />
        </Field>
      </div>
    </Modal>
  );
}
