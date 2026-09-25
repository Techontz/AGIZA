"use client";

import { AlertCircle, AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";

import type { CalculationResult } from "@/lib/api/services/shipping-engine";

import { SectionCard } from "./ui";

const kg = (v: string | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 })} KG`);
const n = (v: string | number | null | undefined, digits = 6) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits });

function Pair({ k, v, tone }: { k: string; v: React.ReactNode; tone: "green" | "yellow" | "red" }) {
  const key = { green: "text-green-600", yellow: "text-yellow-700", red: "text-red-600" }[tone];
  const val = { green: "text-green-900", yellow: "text-yellow-900", red: "text-red-900" }[tone];
  return (
    <div>
      <p className={`text-xs font-medium ${key}`}>{k}</p>
      <p className={`text-sm font-semibold ${val}`}>{v}</p>
    </div>
  );
}

/** Renders a real calculation from Django in the design's result layout. */
export function RateResult({ result }: { result: CalculationResult }) {
  const { rule, pricing, measurements: m } = result;
  const priced = result.status === "priced" && pricing;
  const tone = priced ? "green" : result.status === "manual_quote" ? "yellow" : "red";
  const box = {
    green: "bg-green-50 border-green-200",
    yellow: "bg-yellow-50 border-yellow-200",
    red: "bg-red-50 border-red-200",
  }[tone];
  const heading = priced ? "Rule Matched" : result.status === "manual_quote" ? "Manual Quote Required" : result.status === "blocked" ? "Shipment Blocked" : "No Rate Available";
  const HeadIcon = priced ? CheckCircle : result.status === "manual_quote" ? Clock : AlertCircle;
  const headColor = { green: "text-green-600", yellow: "text-yellow-600", red: "text-red-600" }[tone];
  const headText = { green: "text-green-800", yellow: "text-yellow-800", red: "text-red-800" }[tone];

  const volumetric = m.volumetric_weight_kg ? `${kg(m.volumetric_weight_kg)} (÷${m.volumetric_divisor.toLocaleString()})` : "Needs dimensions";
  const pairs: [string, React.ReactNode][] = [
    ["Route", result.route?.label ?? "—"],
    ["Shipping Profile", result.profile?.name ?? "No profile"],
    ["Method", result.method.name],
    ["Carrier", result.carrier?.name ?? "Any"],
    ["Pricing Model", pricing?.pricing_model_display ?? rule?.pricing_model_display ?? "—"],
    ["Rate", pricing?.rate_display ?? rule?.rate_display ?? "—"],
    ["Quantity", m.quantity],
    ["Minimum Charge", rule?.minimum_charge_display ?? "None"],
    ["Special Handling", result.special_handling.length ? result.special_handling.join(", ") : "None"],
    ["Estimated Delivery", result.estimated_delivery ?? "—"],
    ["Actual Weight", kg(m.actual_weight_kg)],
    ["Volumetric Weight", volumetric],
    ["Chargeable Weight", pricing?.chargeable_weight_kg ? `${kg(pricing.chargeable_weight_kg)} (${pricing.weight_basis})` : "—"],
    ["CBM", m.cbm ? `${n(m.cbm)} m³` : "—"],
  ];

  return (
    <div className="space-y-4" data-testid="rate-result">
      <div className={`border rounded-2xl p-5 ${box}`}>
        <div className="flex items-center gap-2 mb-1">
          <HeadIcon className={`size-5 ${headColor}`} />
          <span className={`font-semibold ${headText}`}>{heading}</span>
          {rule && (
            <span className="ml-auto font-mono text-xs bg-white/70 border border-current/10 px-2 py-0.5 rounded">
              {rule.code} · {rule.priority_display}
            </span>
          )}
        </div>
        {!priced && <p className={`text-sm mb-3 ${headText}`}>{result.message}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-3">
          {pairs.map(([k, v]) => (
            <Pair key={k} k={k} v={v} tone={tone} />
          ))}
        </div>

        {result.override && (
          <div className="mt-4 bg-white/70 border border-yellow-200 rounded-lg px-3 py-2 text-sm text-yellow-800 flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
            <span>
              Override <strong>{result.override.code}</strong> applied:{" "}
              <span className="line-through">{result.override.original_rate_display}</span> →{" "}
              <strong>{result.override.override_rate_display}</strong> — {result.override.reason}
            </span>
          </div>
        )}

        {priced && (
          <>
            <div className="mt-4 pt-4 border-t border-green-200 text-sm text-green-900 space-y-1">
              <div className="flex justify-between gap-4">
                <span>
                  {pricing.rate_display} × {n(pricing.units)} {pricing.unit_label}
                </span>
                <span className="font-semibold">{pricing.subtotal_display}</span>
              </div>
              {pricing.minimum_applied && (
                <div className="flex justify-between gap-4 text-green-800">
                  <span>Raised to minimum charge</span>
                  <span className="font-semibold">{pricing.minimum_charge_display}</span>
                </div>
              )}
              {pricing.source_currency !== pricing.target_currency && (
                <div className="flex justify-between gap-4 text-green-800">
                  <span>
                    Exchange rate {pricing.source_currency} → {pricing.target_currency}
                    {pricing.exchange_rate_date ? ` (from ${pricing.exchange_rate_date})` : ""}
                  </span>
                  <span className="font-semibold">{n(pricing.exchange_rate)}</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-green-200 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-green-600">Total Shipping Cost</p>
                <p className="text-3xl font-bold text-green-800">{pricing.amount_display}</p>
              </div>
              {pricing.source_currency !== pricing.target_currency && (
                <div className="text-right">
                  <p className="text-xs text-green-600">In {pricing.target_currency === "TZS" ? "TSh" : pricing.target_currency}</p>
                  <p className="text-2xl font-bold text-green-800">{pricing.total_display}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <SectionCard title={priced ? "Why This Rule Was Selected" : "How The Engine Decided"}>
        <div className="p-5 space-y-2.5">
          {result.explanation.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              {step.ok ? (
                <CheckCircle className="size-4 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="size-4 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <p className="text-sm text-gray-700">{step.text}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {result.considered.length > 0 && (
        <SectionCard title="Other Rules Considered (Not Applied)">
          <div className="p-5 space-y-2">
            {result.considered.map((c) => (
              <div key={c.code} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                <XCircle className="size-4 text-gray-300 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {c.label} — <span className="text-gray-500">{c.rate_display}</span>
                  </p>
                  <p className="text-xs text-gray-400">{c.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
