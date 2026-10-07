"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, DollarSign, Edit2, PackageCheck, Truck, XCircle } from "lucide-react";
import { useState } from "react";

import { StatusHistoryList } from "@/components/orders/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { can, useMe } from "@/hooks/use-me";
import { procurementApi, procurementKeys, type ProcurementOrder } from "@/lib/api/services/procurement";
import { formatDate, formatDateTime, formatTSh } from "@/lib/format";

import { ExceptionBadge, ProcurementOriginBadge, ProcurementStatusBadge } from "./badges";
import {
  CancelSupplierDialog,
  EditProcurementDialog,
  MarkPaidDialog,
  MarkShippedDialog,
  SelectSupplierDialog,
} from "./workflow-dialogs";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      <div className="text-gray-900">{children}</div>
    </div>
  );
}

/** Procurement record: details, status history and the workflow actions available now. */
export function ProcurementDetailsModal({ proc, onClose }: { proc: ProcurementOrder; onClose: () => void }) {
  const { data: me } = useMe();
  const canEdit = can(me, "procurement", "edit");
  const history = useQuery({ queryKey: procurementKeys.history(proc.id), queryFn: () => procurementApi.history(proc.id) });
  const [dialog, setDialog] = useState<null | "select" | "paid" | "shipped" | "cancel" | "edit">(null);
  const close = () => setDialog(null);
  const has = (a: ProcurementOrder["actions"][number]) => proc.actions.includes(a);
  const editable = proc.status !== "cancelled";

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`Procurement - ${proc.order.reference}`}
        size="4xl"
        footer={
          canEdit && (editable || proc.actions.length > 0) ? (
            <div className="flex flex-wrap gap-2 w-full">
              {has("select_supplier") && (
                <Button onClick={() => setDialog("select")}>
                  <Truck className="size-4" /> {proc.supplier && proc.status === "supplier_selected" ? "Change Supplier" : "Select Supplier"}
                </Button>
              )}
              {has("mark_paid") && (
                <Button variant="success" onClick={() => setDialog("paid")}>
                  <CheckCircle2 className="size-4" /> Mark Supplier Paid
                </Button>
              )}
              {has("mark_shipped") && (
                <Button variant="success" onClick={() => setDialog("shipped")}>
                  <PackageCheck className="size-4" /> Supplier Shipped
                </Button>
              )}
              {has("cancel_supplier") && (
                <Button variant="danger" onClick={() => setDialog("cancel")}>
                  <XCircle className="size-4" /> Supplier Cancelled
                </Button>
              )}
              {editable && (
                <Button variant="outline" onClick={() => setDialog("edit")}>
                  <Edit2 className="size-4" /> Edit Details
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="size-5 text-blue-600" />
              Costs
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Item Cost</p>
                <p className="text-xl font-bold text-gray-900">{formatTSh(proc.item_cost)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Unit Cost</p>
                <p className="text-xl font-bold text-gray-900">{formatTSh(proc.unit_cost)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Quantity</p>
                <p className="text-xl font-bold text-gray-900">{proc.quantity}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <div className="mt-1"><ProcurementStatusBadge status={proc.status} label={proc.status_display} /></div>
              </div>
            </div>
            {proc.paid_at && (
              <p className="mt-4 p-3 bg-green-100 rounded-lg text-sm text-green-900">
                <strong>Supplier paid</strong> {formatDateTime(proc.paid_at)}
                {proc.payment_reference && <> · Ref <span className="font-mono">{proc.payment_reference}</span></>}
              </p>
            )}
            {proc.shipped_at && (
              <p className="mt-2 p-3 bg-teal-100 rounded-lg text-sm text-teal-900">
                <strong>Supplier shipped</strong> {formatDateTime(proc.shipped_at)}
                {proc.supplier_tracking_number && <> · Tracking <span className="font-mono">{proc.supplier_tracking_number}</span></>}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Info label="Order">
                {proc.order.reference} <span className="text-sm text-gray-500">({proc.order.status_display})</span>
              </Info>
              <Info label="Customer">{proc.order.customer}</Info>
              <Info label="Item/Summary">{proc.order.item_details}</Info>
              <Info label="Origin"><div className="mt-1"><ProcurementOriginBadge iso2={proc.origin.iso2} name={proc.origin.name} /></div></Info>
              <Info label="Service Type">{proc.order.service_type_display}</Info>
            </div>
            <div className="space-y-4">
              <Info label="Supplier">{proc.supplier ? `${proc.supplier.name} (${proc.supplier.reference})` : "Not selected"}</Info>
              <Info label="Supplier Order / Invoice #">{proc.supplier_order_number || "—"}</Info>
              <Info label="Tracking #">
                {proc.supplier_tracking_number ? <span className="font-mono">{proc.supplier_tracking_number}</span> : "—"}
              </Info>
              <Info label="Assigned Operator">{proc.operator?.full_name ?? "Unassigned"}</Info>
              <Info label="Exception Flag"><div className="mt-1"><ExceptionBadge flag={proc.exception_flag} /></div></Info>
              <Info label="Expected to Cargo">{formatDate(proc.expected_at_cargo)}</Info>
              {proc.received_at && <Info label="Received at Cargo">{formatDateTime(proc.received_at)}</Info>}
            </div>
          </div>

          {proc.notes && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-semibold text-yellow-900 mb-1">Notes:</p>
              <p className="text-sm text-yellow-800 whitespace-pre-line">{proc.notes}</p>
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Status History</h3>
            {history.isError ? (
              <p className="text-sm text-red-600">
                Couldn&apos;t load the history.{" "}
                <button type="button" className="underline" onClick={() => history.refetch()}>Retry</button>
              </p>
            ) : (
              <StatusHistoryList entries={history.data} loading={history.isPending} />
            )}
          </div>
        </div>
      </Modal>

      <SelectSupplierDialog proc={proc} open={dialog === "select"} onClose={close} />
      <MarkPaidDialog proc={proc} open={dialog === "paid"} onClose={close} />
      <MarkShippedDialog proc={proc} open={dialog === "shipped"} onClose={close} />
      <CancelSupplierDialog proc={proc} open={dialog === "cancel"} onClose={close} />
      <EditProcurementDialog proc={proc} open={dialog === "edit"} onClose={close} />
    </>
  );
}
