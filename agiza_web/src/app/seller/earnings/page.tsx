"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge, type Tone } from "@/components/ui/badge";
import { Card, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";
import { date, money } from "@/lib/format";

export default function SellerEarnings() {
  const data = useQuery({
    queryKey: ["seller", "earnings"],
    queryFn: sellerApi.earnings,
  });
  if (data.isLoading) return <Skeleton className="h-96" />;
  if (data.isError || !data.data) return <Notice tone="danger">{errorMessage(data.error)}</Notice>;
  const { summary: s, payouts, payout_account: acc, payout_schedule, ledger } = data.data;
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Earnings</h1>
      <p className="-mt-2 text-muted">Earnings become payable when an order is delivered and fully paid. {payout_schedule}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Pending" value={money(s.pending)} hint="Orders not yet delivered and paid" />
        {Number(s.payable) < 0 ? (
          <Tile label="To be deducted" value={money(Math.abs(Number(s.payable)))} hint="Refunds after you were paid; taken from your next earnings" />
        ) : (
          <Tile label="Payable" value={money(s.payable)} hint="AGIZA will pay this out" strong />
        )}
        <Tile label="In a payout" value={money(s.in_payout ?? "0")} hint="Being paid now" />
        <Tile label="Paid out" value={money(s.paid_out)} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-ink">All time</h2>
          <Row label={`Gross sales (${s.orders} order${s.orders === 1 ? "" : "s"})`} value={money(s.gross_sales)} />
          <Row label="AGIZA commission" value={`− ${money(s.commission)}`} />
          <div className="my-1 border-t border-line" />
          <Row label="Your earnings" value={money(s.net_earnings)} strong />
          {Number(s.refunds ?? 0) ? <Row label="Customer refunds deducted" value={money(s.refunds ?? "0")} /> : null}
          {Number(s.adjustments ?? 0) ? <Row label="Adjustments" value={money(s.adjustments ?? "0")} /> : null}
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-ink">Payout account</h2>
          {acc.method ? (
            <>
              <Row label="Method" value={acc.method} />
              <Row label={acc.method === "Bank transfer" ? "Bank" : "Network"} value={acc.provider || "—"} />
              <Row label="Account name" value={acc.account_name || "—"} />
              <Row label="Account" value={acc.account_number || "—"} />
            </>
          ) : (
            <p className="text-muted">Add your payout details in Store settings so AGIZA can pay you.</p>
          )}
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 text-lg font-semibold text-ink">Payouts</h2>
        {payouts.length ? (
          <ul className="divide-y divide-line">
            {payouts.map((p) => (
              <li key={p.reference} className="flex justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {p.reference} <Badge tone={PAYOUT_TONE[p.status] ?? "neutral"}>{p.status_display}</Badge>
                  </span>
                  <span className="block text-[13px] text-muted">
                    {date(p.paid_at ?? p.created_at)} · {p.method}
                    {p.transaction_reference ? ` · ${p.transaction_reference}` : ""} · {p.orders} order{p.orders === 1 ? "" : "s"}
                  </span>
                  {Number(p.refund_deductions) || Number(p.adjustments) ? (
                    <span className="block text-[12px] text-muted">
                      Sales {money(p.gross_sales)} − commission {money(p.commission)}
                      {Number(p.refund_deductions) ? ` − refunds ${money(p.refund_deductions)}` : ""}
                      {Number(p.adjustments) ? ` · adjustments ${money(p.adjustments)}` : ""}
                    </span>
                  ) : null}
                </span>
                <span className={p.status === "paid" ? "font-semibold text-ink tabular-nums" : "font-semibold text-muted tabular-nums"}>{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No payouts yet.</p>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold text-ink">Statement</h2>
        <p className="mb-2 text-[13px] text-muted">Every change to your balance, newest first. Entries are never edited; corrections appear as new lines.</p>
        {ledger.length ? (
          <>
            <ul className="divide-y divide-line sm:hidden">
              {ledger.map((e, n) => (
                <li key={n} className="flex justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0">
                    <span className="block text-ink">{e.kind_display}</span>
                    <span className="block text-[12px] text-muted">
                      {date(e.at)} · {[e.reference, e.note].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={Number(e.amount) < 0 ? "shrink-0 text-danger tabular-nums" : "shrink-0 text-ink tabular-nums"}>{money(e.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-muted">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Details</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ledger.map((e, n) => (
                    <tr key={n}>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted">{date(e.at)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-ink">{e.kind_display}</td>
                      <td className="py-2 pr-3 text-muted">{[e.reference, e.note].filter(Boolean).join(" · ")}</td>
                      <td className={Number(e.amount) < 0 ? "py-2 text-right text-danger tabular-nums" : "py-2 text-right text-ink tabular-nums"}>
                        {money(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-muted">Nothing yet.</p>
        )}
      </Card>
    </>
  );
}

const PAYOUT_TONE: Record<string, Tone> = {
  processing: "info",
  paid: "success",
  failed: "danger",
  reversed: "warning",
};

function Tile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={strong ? "mt-1 text-xl font-bold text-primary" : "mt-1 text-xl font-bold text-ink"}>{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
