"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronUp, CreditCard, DollarSign, Edit2, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { orderKeys, ordersApi, type InternationalOrder } from "@/lib/api/services/orders";
import { formatDate, formatTSh } from "@/lib/format";

import { PaymentDialog, StatusHistoryList, TransitionDialog, useOrderAccess, useOrderMutation } from "../shared";
import { OrderTypeBadge, OriginBadge, PaymentBadge, StatusBadge } from "./badges";

function EditDialog({ order, open, onClose }: { order: InternationalOrder; open: boolean; onClose: () => void }) {
  const d = order.details;
  const handlers = useQuery({ queryKey: ["orders", "assignees", "handler"], queryFn: () => ordersApi.international.assignees("handler"), enabled: open });
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open)
      setV({
        supplier_name: d.supplier_name, tracking_number: d.tracking_number,
        item_cost: d.item_cost ? String(Number(d.item_cost)) : "", shipping_cost: d.shipping_cost ? String(Number(d.shipping_cost)) : "",
        total_amount: order.total_amount ? String(Number(order.total_amount)) : "", handler: order.handler ? String(order.handler.id) : "",
        estimated_delivery: d.estimated_delivery ?? "",
      });
  }, [open, order, d]);
  const save = useOrderMutation(
    () =>
      ordersApi.international.update(order.id, {
        supplier_name: v.supplier_name, tracking_number: v.tracking_number,
        item_cost: v.item_cost || null, shipping_cost: v.shipping_cost || null,
        ...(v.total_amount ? { total_amount: v.total_amount } : {}),
        handler: v.handler ? Number(v.handler) : null, estimated_delivery: v.estimated_delivery || null,
      }),
    { success: "Order updated", onSuccess: onClose },
  );
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${order.reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={() => save.mutate(undefined)} loading={save.isPending}>Save Changes</Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Supplier" htmlFor="io-supplier"><Input id="io-supplier" value={v.supplier_name ?? ""} onChange={set("supplier_name")} /></Field>
        <Field label="Tracking Number" htmlFor="io-track"><Input id="io-track" value={v.tracking_number ?? ""} onChange={set("tracking_number")} /></Field>
        <Field label="Item Cost (TSh)" htmlFor="io-cost"><Input id="io-cost" type="number" min="0" value={v.item_cost ?? ""} onChange={set("item_cost")} /></Field>
        <Field label="Shipping Cost (TSh)" htmlFor="io-ship"><Input id="io-ship" type="number" min="0" value={v.shipping_cost ?? ""} onChange={set("shipping_cost")} /></Field>
        <Field label="Total Amount (TSh)" htmlFor="io-total"><Input id="io-total" type="number" min="0" value={v.total_amount ?? ""} onChange={set("total_amount")} /></Field>
        <Field label="Estimated Delivery" htmlFor="io-eta"><Input id="io-eta" type="date" value={v.estimated_delivery ?? ""} onChange={set("estimated_delivery")} /></Field>
        <Field label="Handler" htmlFor="io-handler">
          <Select id="io-handler" value={v.handler ?? ""} onChange={set("handler")}>
            <option value="">Unassigned</option>
            {handlers.data?.map((h) => <option key={h.id} value={h.id}>{h.full_name}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/** Design: "Order Details - {id}" modal, with real history and workflow actions. */
export function InternationalDetailsModal({ order, onClose }: { order: InternationalOrder; onClose: () => void }) {
  const titleId = useId();
  const { canEdit, canManage, canPay } = useOrderAccess();
  const d = order.details;
  const history = useQuery({ queryKey: orderKeys.sub("international", order.id, "history"), queryFn: () => ordersApi.international.history(order.id) });
  const [dialog, setDialog] = useState<null | "status" | "payment" | "edit">(null);
  const close = () => setDialog(null);
  const move = useOrderMutation(({ status, note }: { status: string; note: string }) => ordersApi.international.transition(order.id, status, note), {
    success: (o) => `${(o as InternationalOrder).reference}: ${(o as InternationalOrder).status_display}`,
    onSuccess: close,
  });
  const pay = useOrderMutation((data: Record<string, unknown>) => ordersApi.international.recordPayment(order.id, data), {
    success: "Payment recorded",
    onSuccess: close,
  });
  const installments = useOrderMutation((allowed: boolean) => ordersApi.international.installmentApproval(order.id, allowed), {
    success: (o) => ((o as InternationalOrder).installment_allowed ? "Installments approved" : "Installment approval withdrawn"),
  });
  const closed = ["completed", "cancelled"].includes(order.status);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 id={titleId} className="text-2xl font-bold text-gray-900">Order Details - {order.reference}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700" aria-label="Close">
            <ChevronUp className="size-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="size-5 text-blue-600" />
              Payment Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-xl font-bold text-gray-900">{formatTSh(order.payment.total)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Amount Paid</p>
                <p className="text-xl font-bold text-green-600">{formatTSh(order.payment.paid)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Amount Due</p>
                <p className="text-xl font-bold text-red-600">{formatTSh(order.payment.due)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Payment Status</p>
                <div className="mt-1"><PaymentBadge status={order.payment.status} /></div>
              </div>
            </div>
            {order.installment_plan && (
              <div className="mt-4 p-3 bg-blue-100 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-blue-900">
                  <strong>Installment Status:</strong>{" "}
                  {order.installment_allowed ? "✓ Allowed to proceed" : "⚠ Waiting for admin approval or required advance payment"}
                </p>
                {canManage && !closed && (
                  <button type="button" onClick={() => installments.mutate(!order.installment_allowed)} disabled={installments.isPending} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900">
                    <ShieldCheck className="size-4" /> {order.installment_allowed ? "Withdraw approval" : "Approve installments"}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">Customer Name</p>
                <p className="text-gray-900">{order.customer.full_name}</p>
                {order.customer.phone && <p className="text-sm text-gray-500">{order.customer.phone}</p>}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Items</p>
                <p className="text-gray-900">{order.item_details}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Source Origin</p>
                <div className="mt-1"><OriginBadge iso2={d.source_country.iso2} /></div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Order Type</p>
                <div className="mt-1"><OrderTypeBadge type={d.order_class} /></div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700">Supplier</p>
                <p className="text-gray-900">{d.supplier_name || "Not assigned"}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Handler</p>
                <p className="text-gray-900">{order.handler?.full_name ?? "Unassigned"}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Current Status</p>
                <div className="mt-1"><StatusBadge status={order.status} label={order.status_display} /></div>
              </div>
              {d.tracking_number && (
                <div>
                  <p className="text-sm font-semibold text-gray-700">Tracking Number</p>
                  <p className="text-gray-900 font-mono">{d.tracking_number}</p>
                </div>
              )}
              {d.estimated_delivery && (
                <div>
                  <p className="text-sm font-semibold text-gray-700">Estimated Delivery</p>
                  <p className="text-gray-900">{formatDate(d.estimated_delivery)}</p>
                </div>
              )}
            </div>
          </div>

          {(d.item_cost || d.shipping_cost) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Cost Breakdown</h3>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-gray-600">Item Cost:</span><span className="font-medium">{formatTSh(d.item_cost)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Shipping Cost:</span><span className="font-medium">{formatTSh(d.shipping_cost)}</span></div>
                <div className="flex justify-between pt-2 border-t border-gray-300">
                  <span className="font-semibold text-gray-900">Total Amount:</span>
                  <span className="font-bold text-gray-900">{formatTSh(order.total_amount)}</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Status History</h3>
            <StatusHistoryList entries={history.data} loading={history.isPending} />
          </div>

          {order.notes && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-semibold text-yellow-900 mb-1">Notes:</p>
              <p className="text-sm text-yellow-800">{order.notes}</p>
            </div>
          )}
        </div>

        {(canEdit || canPay) && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex flex-wrap gap-2">
            {canEdit && !closed && order.allowed_transitions.length > 0 && (
              <Button onClick={() => setDialog("status")}><RefreshCw className="size-4" /> Update Status</Button>
            )}
            {canPay && order.payment.due !== null && Number(order.payment.due) > 0 && !closed && (
              <Button variant="success" onClick={() => setDialog("payment")}><CreditCard className="size-4" /> Record Payment</Button>
            )}
            {canEdit && !closed && (
              <Button variant="outline" onClick={() => setDialog("edit")}><Edit2 className="size-4" /> Edit Details</Button>
            )}
          </div>
        )}
      </div>

      <TransitionDialog
        open={dialog === "status"}
        onClose={close}
        options={order.allowed_transitions}
        current={order.status_display}
        canCancel={canManage}
        onSubmit={(status, note) => move.mutate({ status, note })}
        pending={move.isPending}
      />
      <PaymentDialog open={dialog === "payment"} onClose={close} due={order.payment.due} onSubmit={(data) => pay.mutate(data)} pending={pay.isPending} />
      <EditDialog order={order} open={dialog === "edit"} onClose={close} />
    </div>
  );
}
