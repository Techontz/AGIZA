"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImageIcon, MessageSquare, PackageCheck, Store } from "lucide-react";
import { useState } from "react";

import { fileSrc } from "@/lib/api/files";
import { cn } from "@/lib/cn";
import { returnKeys, returnsApi, type ReturnRequest, type ReturnStatus } from "@/lib/api/services/returns";
import { formatDateTime, formatTSh } from "@/lib/format";

import { CustomerRequestTag, RefundStatusBadge, useReturnAccess } from "./badges";
import { HistoryDialog, MessageCustomerDialog, ReassignDialog, UpdateStatusDialog, stepsFor } from "./dialogs";

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

/**
 * What the customer asked for and sent (their explanation, the returned lines,
 * evidence photos), the sellers' responses, what AGIZA last told them, and
 * the stock / vendor-earnings outcome.
 */
function hasRequestInfo(r: ReturnRequest): boolean {
  return Boolean(
    r.requested_by_customer || r.lines.length || r.attachments.length || r.vendor_responses.length || r.customer_message || r.restocked || r.reconciled_at,
  );
}

function CustomerRequestPanel({ ret: r }: { ret: ReturnRequest }) {
  const images = r.attachments.filter((a) => a.content_type.startsWith("image/"));
  const files = r.attachments.filter((a) => !a.content_type.startsWith("image/"));

  return (
    <div className="bg-white p-4 rounded border border-gray-200 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {r.requested_by_customer && <CustomerRequestTag />}
        <RefundStatusBadge status={r.refund_status} />
        <span className="text-sm text-gray-600">
          Customer sees: <span className="font-medium text-gray-900">{r.customer_status_display}</span>
        </span>
        {r.restocked && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
            <PackageCheck className="size-3.5" /> Back in stock
          </span>
        )}
        {r.reconciled_at && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5"
            title={formatDateTime(r.reconciled_at)}
          >
            <CheckCircle2 className="size-3.5" /> Vendor earnings adjusted · {formatDateTime(r.reconciled_at)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4 min-w-0">
          {r.customer_note && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Customer&apos;s explanation</p>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-sm text-gray-800 whitespace-pre-line break-words">{r.customer_note}</p>
              </div>
            </div>
          )}
          {r.lines.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Returned items</p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["Item", "Qty", "Amount", "Seller"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {r.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2 text-gray-900">
                          {l.name}
                          {l.variant_name && <span className="text-gray-500"> — {l.variant_name}</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{l.quantity}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{formatTSh(l.amount)}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          <span className={cn(l.seller === "AGIZA" && "text-blue-700 font-medium")}>{l.seller}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          {r.attachments.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Evidence ({r.attachments.length})</p>
              <div className="flex flex-wrap gap-2">
                {images.map((a) => (
                  <a
                    key={a.id}
                    href={fileSrc(a.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Photo · ${formatDateTime(a.at)}`}
                    className="block rounded-lg border border-gray-200 overflow-hidden hover:ring-2 hover:ring-blue-500"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL */}
                    <img src={fileSrc(a.url)} alt="Customer evidence" loading="lazy" className="size-20 object-cover bg-gray-50" />
                  </a>
                ))}
                {files.map((a) => (
                  <a
                    key={a.id}
                    href={fileSrc(a.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="size-20 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-xs text-blue-600 hover:text-blue-800"
                  >
                    <ImageIcon className="size-5 mb-1" /> Open file
                  </a>
                ))}
              </div>
            </div>
          )}
          {r.vendor_responses.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Seller responses</p>
              <ul className="space-y-2">
                {r.vendor_responses.map((v, i) => (
                  <li key={`${v.at}-${i}`} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Store className="size-3.5" /> {v.vendor} · {formatDateTime(v.at)}
                    </p>
                    <p className="text-sm text-gray-800 mt-1 whitespace-pre-line break-words">{v.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.customer_message && (
            <div>
              <p className="text-sm text-gray-600 mb-1">Last message to the customer</p>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-gray-800 whitespace-pre-line break-words flex gap-2">
                  <MessageSquare className="size-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span>{r.customer_message}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
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
  const [dialog, setDialog] = useState<"status" | "reassign" | "history" | "message" | null>(null);
  const canUpdate = canEdit && stepsFor(ret).length > 0;
  const canReassign = canEdit && ret.status !== "closed";
  const close = () => setDialog(null);

  return (
    <div className="space-y-6">
      {hasRequestInfo(ret) && (
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">{ret.requested_by_customer ? "Customer Request" : "Returned Items"}</h4>
          <CustomerRequestPanel ret={ret} />
        </div>
      )}
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
            {canEdit && (
              <button type="button" className={btnSecondary} onClick={() => setDialog("message")}>
                Message Customer
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
        <MessageCustomerDialog ret={ret} open={dialog === "message"} onClose={close} />
      </div>
    </div>
  );
}
