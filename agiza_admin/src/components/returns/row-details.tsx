"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { returnKeys, returnsApi, type ReturnRequest, type ReturnStatus } from "@/lib/api/services/returns";
import { formatDateTime, formatTSh } from "@/lib/format";

import { useReturnAccess } from "./badges";
import { HistoryDialog, ReassignDialog, UpdateStatusDialog, stepsFor } from "./dialogs";

const btnPrimary = "w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium";
const btnSecondary = "w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-gray-600">{label}</p>
      <div className="font-medium text-gray-900 break-words">{children}</div>
    </div>
  );
}

function ItemDetails({ ret: r }: { ret: ReturnRequest }) {
  return (
    <div className="bg-white p-4 rounded border border-gray-200 space-y-2">
      <Info label="Item">{r.item_details || "—"}</Info>
      <div>
        <p className="text-sm text-gray-600">Return Value</p>
        <p className="font-semibold text-gray-900">{formatTSh(r.return_value)}</p>
      </div>
      {r.refund_amount && (
        <div>
          <p className="text-sm text-gray-600">Refund Amount</p>
          <p className="font-semibold text-red-700">{formatTSh(r.refund_amount)}</p>
        </div>
      )}
      {r.item_condition && <Info label="Condition">{r.item_condition_display}</Info>}
      {r.inspection_notes && <Info label="Inspection Notes"><span className="font-normal text-sm">{r.inspection_notes}</span></Info>}
      {r.decision_notes && <Info label="Decision Notes"><span className="font-normal text-sm">{r.decision_notes}</span></Info>}
      {r.resolution_notes && <Info label="Resolution"><span className="font-normal text-sm">{r.resolution_notes}</span></Info>}
      {r.delivery && <Info label="Delivery">{r.delivery.reference}</Info>}
      {r.notes && (
        <div>
          <p className="text-sm text-gray-600 mb-1">Notes</p>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-800 whitespace-pre-line">{r.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Status Timeline (design), with the dates each step was reached from the real history. */
function StatusTimeline({ ret }: { ret: ReturnRequest }) {
  const history = useQuery({ queryKey: returnKeys.history(ret.id), queryFn: () => returnsApi.history(ret.id) });
  const reachedAt = new Map<string, string>();
  for (const h of history.data ?? []) if (h.from_status !== h.to_status) reachedAt.set(h.to_status, h.created_at);
  const rejected = ret.status === "rejected" || reachedAt.has("rejected");
  const steps: { key: ReturnStatus; label: string; color: string }[] = [
    { key: "initiated", label: "Initiated", color: "bg-blue-600" },
    { key: "in_transit", label: "In Transit (Return)", color: "bg-purple-600" },
    { key: "received", label: "Received", color: "bg-yellow-600" },
    { key: "inspected", label: "Inspected", color: "bg-orange-600" },
    rejected ? { key: "rejected", label: "Rejected", color: "bg-red-600" } : { key: "approved", label: "Approved", color: "bg-green-600" },
    { key: "closed", label: "Closed", color: "bg-green-600" },
  ];
  if (!reachedAt.has("initiated")) reachedAt.set("initiated", ret.created_at);

  return (
    <div className="bg-white p-4 rounded border border-gray-200">
      <ol className="space-y-2">
        {steps.map((s) => {
          const current = ret.status === s.key;
          const at = reachedAt.get(s.key);
          return (
            <li key={s.key} className="flex items-start gap-2" aria-current={current ? "step" : undefined}>
              <div className={cn("size-3 rounded-full mt-1 flex-shrink-0", current ? s.color : "bg-gray-300")} />
              <div>
                <span className={cn("text-sm", current ? "font-semibold text-gray-900" : at ? "text-gray-700" : "text-gray-400")}>{s.label}</span>
                {at && <span className="block text-xs text-gray-500">{formatDateTime(at)}</span>}
              </div>
            </li>
          );
        })}
      </ol>
      {history.isError && (
        <button type="button" onClick={() => history.refetch()} className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800">
          Couldn&apos;t load dates — retry
        </button>
      )}
    </div>
  );
}

/** Expanded "Details" row of the Returns table: Item Details, Status Timeline, Actions. */
export function ReturnRowDetails({ ret }: { ret: ReturnRequest }) {
  const { canEdit } = useReturnAccess();
  const [dialog, setDialog] = useState<"status" | "reassign" | "history" | null>(null);
  const canUpdate = canEdit && stepsFor(ret).length > 0;
  const canReassign = canEdit && ret.status !== "closed";
  const close = () => setDialog(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Item Details</h4>
        <ItemDetails ret={ret} />
      </div>
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Status Timeline</h4>
        <StatusTimeline ret={ret} />
      </div>
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Actions</h4>
        <div className="space-y-2">
          {canUpdate && (
            <button type="button" className={btnPrimary} onClick={() => setDialog("status")}>
              Update Status
            </button>
          )}
          {canReassign && (
            <button type="button" className={btnSecondary} onClick={() => setDialog("reassign")}>
              Reassign Handler
            </button>
          )}
          <button type="button" className={btnSecondary} onClick={() => setDialog("history")}>
            View Full History
          </button>
        </div>
        {!canEdit && <p className="text-xs text-gray-500 mt-3">You have view-only access to returns.</p>}
      </div>
      <UpdateStatusDialog ret={ret} open={dialog === "status"} onClose={close} />
      <ReassignDialog ret={ret} open={dialog === "reassign"} onClose={close} />
      <HistoryDialog ret={ret} open={dialog === "history"} onClose={close} />
    </div>
  );
}
