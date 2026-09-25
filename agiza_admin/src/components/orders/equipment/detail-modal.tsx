"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle, Clock, CreditCard, History, MapPin, RefreshCw, User, Users, XCircle } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "@/lib/cn";
import { orderKeys, ordersApi, type EquipmentOrder } from "@/lib/api/services/orders";
import { formatTSh } from "@/lib/format";

import { AssignDialog, PaymentDialog, StatusHistoryList, TransitionDialog, useOrderAccess, useOrderMutation } from "../shared";
import { PAYMENT_TEXT, SERVICE_STYLE, shortDateTime, titleCaseClass } from "./shared";

const STEP_ICON = { logged: Clock, assigned: User, on_site: MapPin, completed: CheckCircle } as const;

/** Design: Equipment Support detail modal, driven by real data and actions. */
export function EquipmentDetailModal({ order, onClose }: { order: EquipmentOrder; onClose: () => void }) {
  const titleId = useId();
  const { canEdit, canManage, canPay } = useOrderAccess();
  const d = order.details;
  const style = SERVICE_STYLE[d.service_type];
  const Icon = style.icon;
  const [dialog, setDialog] = useState<null | "payment" | "tech" | "status">(null);
  const [showHistory, setShowHistory] = useState(false);
  const close = () => setDialog(null);
  const history = useQuery({ queryKey: orderKeys.sub("equipment", order.id, "history"), queryFn: () => ordersApi.equipment.history(order.id), enabled: showHistory });
  const techs = useQuery({ queryKey: ["orders", "assignees", "handler"], queryFn: () => ordersApi.equipment.assignees("handler"), enabled: dialog === "tech" });
  const pay = useOrderMutation((data: Record<string, unknown>) => ordersApi.equipment.recordPayment(order.id, data), { success: "Payment recorded", onSuccess: close });
  const assign = useOrderMutation((user: number) => ordersApi.equipment.assignTechnician(order.id, user), { success: "Technician assigned", onSuccess: close });
  const move = useOrderMutation(({ status, note }: { status: string; note: string }) => ordersApi.equipment.transition(order.id, status, note), {
    success: (o) => `${(o as EquipmentOrder).reference}: ${(o as EquipmentOrder).status_display}`,
    onSuccess: close,
  });
  const [payClass, payLabel] = PAYMENT_TEXT[order.payment.status];
  const closed = ["completed", "cancelled"].includes(order.status);
  const canAssign = canEdit && !closed && order.status !== "pending";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 sm:px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-xl", style.boxStrong)}><Icon className="size-5" /></div>
            <div>
              <h3 id={titleId} className="text-xl font-bold text-gray-900">{order.reference}</h3>
              <p className="text-sm text-gray-500">{d.equipment}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-600 shadow-sm" aria-label="Close">
            <XCircle className="size-6" />
          </button>
        </div>

        <div className="px-6 sm:px-8 py-6 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Customer Details</p>
                <p className="font-bold text-gray-900">{order.customer.full_name}</p>
                <p className="text-sm text-gray-600">{order.customer.phone}</p>
                <p className="text-sm text-gray-600">{[d.site_address, d.city?.name].filter(Boolean).join(", ") || "—"}, Tanzania</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Assigned Technician</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="size-8 bg-blue-50 rounded-full flex items-center justify-center"><User className="size-4 text-blue-600" /></div>
                  <p className="font-medium text-gray-900">{d.technician?.full_name ?? "Not assigned"}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/50">
                <p className="text-xs text-blue-600 uppercase font-bold tracking-wider mb-1">Total Service Value</p>
                <p className="text-2xl font-black text-blue-700">{formatTSh(order.total_amount)}</p>
                <div className={cn("mt-2 text-xs font-bold px-2 py-1 rounded w-fit", order.payment.status === "fully_paid" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                  {payLabel.toUpperCase()}
                </div>
                {order.payment.due !== null && Number(order.payment.due) > 0 && (
                  <p className={cn("text-xs mt-1", payClass)}>Due: {formatTSh(order.payment.due)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Service Type</p>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold">
                  {d.service_type_display} - {titleCaseClass(d.classification)}
                </span>
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="mb-8">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Requirement Description</p>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-700 leading-relaxed">{order.notes}</div>
            </div>
          )}

          <div className="space-y-4">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">Service Timeline</p>
            {order.service_timeline.map((step) => {
              const StepIcon = STEP_ICON[step.key as keyof typeof STEP_ICON];
              return (
                <div key={step.key} className="flex items-center gap-4">
                  <div className={cn("size-8 rounded-full flex items-center justify-center shrink-0", step.done ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400")}>
                    <StepIcon className="size-4" />
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <p className={cn("text-sm font-bold", step.done ? "text-gray-900" : "text-gray-400")}>{step.label}</p>
                    <p className="text-xs text-gray-500">{step.at ? shortDateTime(step.at) : "Pending"}</p>
                  </div>
                </div>
              );
            })}
            <p className="text-sm text-gray-600">
              Current status: <span className="font-semibold text-gray-900">{order.status_display}</span>
            </p>
            <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800">
              <History className="size-4" /> {showHistory ? "Hide status history" : "Show status history"}
            </button>
            {showHistory && <StatusHistoryList entries={history.data} loading={history.isPending} />}
          </div>
        </div>

        <div className="px-6 sm:px-8 py-6 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-stretch gap-3">
          {canPay && !closed && order.payment.due !== null && Number(order.payment.due) > 0 && (
            <button type="button" onClick={() => setDialog("payment")} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-white transition-colors">
              <CreditCard className="size-4" /> Update Payment
            </button>
          )}
          {canEdit && !closed && order.allowed_transitions.length > 0 && (
            <button type="button" onClick={() => setDialog("status")} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-white transition-colors">
              <RefreshCw className="size-4" /> Update Status
            </button>
          )}
          {canAssign && (
            <button type="button" onClick={() => setDialog("tech")} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95">
              <Users className="size-4" /> {d.technician ? "Change Technician" : "Assign Technician"}
            </button>
          )}
        </div>
      </div>

      <PaymentDialog open={dialog === "payment"} onClose={close} due={order.payment.due} onSubmit={(data) => pay.mutate(data)} pending={pay.isPending} />
      <AssignDialog open={dialog === "tech"} onClose={close} title={`Technician — ${order.reference}`} people={techs.data} currentId={d.technician?.id} onSubmit={(id) => assign.mutate(id)} pending={assign.isPending} />
      <TransitionDialog open={dialog === "status"} onClose={close} options={order.allowed_transitions} current={order.status_display} canCancel={canManage} onSubmit={(status, note) => move.mutate({ status, note })} pending={move.isPending} />
    </div>
  );
}
