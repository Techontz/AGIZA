"use client";

import { useQuery } from "@tanstack/react-query";
import { Calendar, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { can, useMe } from "@/hooks/use-me";
import { ordersApi, type ExpressOrder } from "@/lib/api/services/orders";
import { engine } from "@/lib/api/services/shipping-engine";

import { errorText, useOrderMutation } from "../shared";

/** yyyy-MM-ddTHH:mm in local time, for datetime-local inputs. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const input = "w-full pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Create / edit quote form (design: renderQuoteForm in DeliveryTable). */
export function QuoteForm({ order, isEditing, onDone }: { order: ExpressOrder; isEditing: boolean; onDone: () => void }) {
  const { data: me } = useMe();
  const d = order.details;
  const [fullPrice, setFullPrice] = useState(isEditing && order.total_amount ? String(Number(order.total_amount)) : "");
  const [eta, setEta] = useState(isEditing ? toLocalInput(d.estimated_delivery_at) : "");
  const [advanceOn, setAdvanceOn] = useState(isEditing ? d.advance_required : false);
  const [advance, setAdvance] = useState(isEditing && d.advance_amount ? String(Number(d.advance_amount)) : "");
  const [error, setError] = useState<string | null>(null);

  // Optional: ask the Shipping Engine for a suggested price.
  const canSuggest = can(me, "shipping_engine", "view");
  const methods = useQuery({
    queryKey: ["se", "methods", "list", { all: true }],
    queryFn: () => engine.methods.all(),
    enabled: canSuggest,
  });
  const [method, setMethod] = useState("");
  useEffect(() => {
    if (!method && methods.data?.length) {
      const local = methods.data.find((m) => m.category === "land" || m.category === "local");
      setMethod(String((local ?? methods.data[0]).id));
    }
  }, [methods.data, method]);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const suggest = useOrderMutation((m: number) => ordersApi.express.suggestPrice(order.id, m), {
    onSuccess: (r) => {
      if (r.total) {
        setFullPrice(String(Number(r.total)));
        setSuggestion(`Suggested ${r.total_display} (${r.rule} · ${r.route}, ${Number(r.weight_kg)} KG from ${r.weight_source})`);
      } else setSuggestion(r.message);
    },
    onError: (e) => setSuggestion(errorText(e)),
  });

  const save = useOrderMutation(
    () =>
      ordersApi.express.quote(order.id, {
        amount: fullPrice,
        estimated_delivery_at: new Date(eta).toISOString(),
        advance_required: advanceOn,
        advance_amount: advanceOn ? advance : null,
      }),
    { success: isEditing ? `Quote updated for ${order.reference}` : `Quote sent for ${order.reference}`, onSuccess: onDone, onError: (e) => setError(errorText(e)) },
  );

  const price = parseFloat(fullPrice);
  const adv = parseFloat(advance);
  const disabled = !fullPrice || !eta || (advanceOn && !advance);

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-6 shadow-lg">
      <h3 className="font-semibold text-lg text-gray-900 mb-4">
        {isEditing ? `Edit Quote for ${order.reference}` : `Create Quote for ${order.reference}`}
      </h3>

      {canSuggest && (d.pickup_city && d.delivery_city) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <select
            aria-label="Shipping method for suggestion"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {methods.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!method || suggest.isPending}
            onClick={() => suggest.mutate(Number(method))}
            className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
          >
            <Sparkles className="size-4" /> {suggest.isPending ? "Calculating…" : "Suggest price from Shipping Engine"}
          </button>
          {suggestion && <p className="w-full text-xs text-gray-500">{suggestion}</p>}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor={`fp-${order.id}`}>
          Full Price (TSh) <span className="text-red-600">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">TSh</span>
          <input id={`fp-${order.id}`} type="number" step="1000" min="0" placeholder="0" value={fullPrice} onChange={(e) => setFullPrice(e.target.value)} className={`${input} pl-14`} />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor={`eta-${order.id}`}>
          Estimated Delivery Date <span className="text-red-600">*</span>
        </label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
          <input id={`eta-${order.id}`} type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} className={`${input} pl-10`} />
        </div>
      </div>

      <div className="mb-4 bg-gray-50 p-4 rounded-lg">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={advanceOn} onChange={(e) => setAdvanceOn(e.target.checked)} className="size-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500" />
          <span className="text-sm font-medium text-gray-700">Require Advance Payment</span>
        </label>
        {advanceOn && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor={`adv-${order.id}`}>
              Advance Payment Amount (TSh) <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">TSh</span>
              <input id={`adv-${order.id}`} type="number" step="1000" min="0" placeholder="0" value={advance} onChange={(e) => setAdvance(e.target.value)} className={`${input} pl-14`} />
            </div>
            <p className="text-xs text-gray-500 mt-1">Customer will pay this amount upfront before delivery begins</p>
          </div>
        )}
      </div>

      {fullPrice && !Number.isNaN(price) && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-900 mb-2">Quote Summary</p>
          <div className="space-y-1 text-sm text-blue-800">
            <div className="flex justify-between">
              <span>Full Price:</span>
              <span className="font-semibold">TSh {price.toLocaleString()}</span>
            </div>
            {eta && (
              <div className="flex justify-between">
                <span>Estimated Delivery:</span>
                <span className="font-semibold">{new Date(eta).toLocaleString()}</span>
              </div>
            )}
            {advanceOn && advance && !Number.isNaN(adv) && (
              <>
                <div className="flex justify-between">
                  <span>Advance Payment:</span>
                  <span className="font-semibold">TSh {adv.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-blue-300">
                  <span>Remaining Balance:</span>
                  <span className="font-semibold">TSh {(price - adv).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save.mutate(undefined)}
          disabled={disabled || save.isPending}
          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {save.isPending ? "Saving…" : isEditing ? "Update Quote" : "Submit Quote"}
        </button>
        <button type="button" onClick={onDone} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}
