"use client";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useEffect, useId } from "react";

import { Skeleton, ErrorState } from "@/components/ui/states";
import { errorText } from "@/lib/api/errors";
import { financeApi, financeKeys } from "@/lib/api/services/finance";
import { formatDate, formatDateTime, formatTSh } from "@/lib/format";

/** Only the receipt is printed: everything else on the page is hidden. */
const PRINT_CSS = `
@media print {
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body * { visibility: hidden !important; }
  .agz-receipt, .agz-receipt * { visibility: visible !important; }
  .agz-receipt-overlay { position: absolute !important; inset: 0 !important; background: none !important; padding: 0 !important; display: block !important; }
  .agz-receipt { position: absolute !important; top: 0; left: 0; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; border-radius: 0 !important; }
  .agz-no-print { display: none !important; }
}
`;

/** The design's PAYMENT RECEIPT with each payment listed; Print prints just the receipt. */
export function ReceiptModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const titleId = useId();
  const receipt = useQuery({ queryKey: financeKeys.receipt(orderId), queryFn: () => financeApi.orderPayments.receipt(orderId) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const r = receipt.data;
  const o = r?.order;

  return (
    <div className="agz-receipt-overlay fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <style>{PRINT_CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="agz-receipt bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 id={titleId} className="text-3xl font-bold text-gray-900 mb-2">PAYMENT RECEIPT</h1>
            <p className="text-gray-600">Agiza Platform</p>
          </div>

          {receipt.isPending ? (
            <div className="space-y-4" aria-busy="true">
              <div className="grid grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-3 w-16 mb-2" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : receipt.isError || !r || !o ? (
            <ErrorState bare message={errorText(receipt.error)} onRetry={() => receipt.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-600">Order ID</p>
                  <p className="font-semibold text-gray-900">{o.reference}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-semibold text-gray-900">{formatDate(o.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Customer</p>
                  <p className="font-semibold text-gray-900">{o.customer.full_name}</p>
                  {o.customer.phone && <p className="text-xs text-gray-500">{o.customer.phone}</p>}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Item</p>
                  <p className="font-semibold text-gray-900 break-words">{o.item_details || o.order_type_display}</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-2">Payments</p>
                {r.payments.length === 0 ? (
                  <p className="text-sm text-gray-500">No payments recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-600 uppercase border-b border-gray-200">
                          <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                          <th scope="col" className="py-2 pr-3 font-semibold">Method</th>
                          <th scope="col" className="py-2 pr-3 font-semibold">Reference</th>
                          <th scope="col" className="py-2 text-right font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {r.payments.map((p) => {
                          const refund = p.kind === "refund";
                          return (
                            <tr key={p.id}>
                              <td className="py-2 pr-3 text-gray-900 whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
                              <td className="py-2 pr-3 text-gray-900">
                                {p.method_display}
                                <span className="block text-xs text-gray-500">{p.kind_display}</span>
                              </td>
                              <td className="py-2 pr-3 text-gray-700 break-all">{p.reference || "—"}</td>
                              <td className={`py-2 text-right font-semibold whitespace-nowrap ${refund ? "text-red-600" : "text-gray-900"}`}>
                                {refund ? "−" : ""}
                                {formatTSh(p.amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-700">Total Amount:</span>
                  <span className="font-semibold">{formatTSh(o.figures.total)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Amount Paid:</span>
                  <span className="font-semibold">{formatTSh(o.figures.paid)}</span>
                </div>
                <div className="flex justify-between text-red-600 pt-2 border-t">
                  <span className="font-semibold">Balance:</span>
                  <span className="font-bold">{formatTSh(o.figures.due)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-6 text-center">Issued {formatDateTime(r.issued_at)}</p>
            </>
          )}

          <div className="agz-no-print mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!r}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Printer className="size-5" />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
