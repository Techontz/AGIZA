"use client";

import { useQuery } from "@tanstack/react-query";

import { Card, Notice, Row, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";
import { date, money } from "@/lib/format";

export default function SellerEarnings() {
  const data = useQuery({ queryKey: ["seller", "earnings"], queryFn: sellerApi.earnings });
  if (data.isLoading) return <Skeleton className="h-96" />;
  if (data.isError || !data.data) return <Notice tone="danger">{errorMessage(data.error)}</Notice>;
  const { summary: s, payouts, payout_account: acc, payout_schedule } = data.data;
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Earnings</h1>
      <p className="-mt-2 text-muted">
        Earnings become payable when an order is delivered and fully paid. {payout_schedule}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Pending" value={money(s.pending)} hint="Orders not yet delivered and paid" />
        <Tile label="Payable" value={money(s.payable)} hint="AGIZA will pay this out" strong />
        <Tile label="Paid out" value={money(s.paid_out)} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-ink">All time</h2>
          <Row label={`Gross sales (${s.orders} order${s.orders === 1 ? "" : "s"})`} value={money(s.gross_sales)} />
          <Row label="AGIZA commission" value={`− ${money(s.commission)}`} />
          <div className="my-1 border-t border-line" />
          <Row label="Your earnings" value={money(s.net_earnings)} strong />
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
                <span>
                  <span className="block font-medium text-ink">{p.reference}</span>
                  <span className="text-[13px] text-muted">
                    {date(p.paid_at)} · {p.method}
                    {p.transaction_reference ? ` · ${p.transaction_reference}` : ""} · {p.orders} order{p.orders === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="font-semibold text-ink tabular-nums">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No payouts yet.</p>
        )}
      </Card>
    </>
  );
}

function Tile({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={strong ? "mt-1 text-xl font-bold text-primary" : "mt-1 text-xl font-bold text-ink"}>{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
