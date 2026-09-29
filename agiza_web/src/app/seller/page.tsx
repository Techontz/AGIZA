"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Package, PackagePlus, ShoppingCart } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card, Notice, Skeleton } from "@/components/ui/states";
import { errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";
import { money } from "@/lib/format";

export default function SellerDashboard() {
  const data = useQuery({ queryKey: ["seller", "dashboard"], queryFn: sellerApi.dashboard });
  if (data.isLoading) return <Skeleton className="h-96" />;
  if (data.isError || !data.data) return <Notice tone="danger">{errorMessage(data.error)}</Notice>;
  const d = data.data;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Karibu, {d.store.contact_person.split(" ")[0] || d.store.name}</h1>
          <p className="text-muted">Commission: {d.store.commission} · {d.store.payout_schedule}</p>
        </div>
        {d.store.can_sell ? (
          <ButtonLink href="/seller/products/new" icon={<PackagePlus className="size-4" />}>
            Add product
          </ButtonLink>
        ) : null}
      </div>
      {d.orders_to_prepare ? (
        <Link href="/seller/orders?status=open" className="flex items-center gap-3 rounded-lg bg-primary-soft p-4 text-primary hover:underline">
          <ShoppingCart className="size-5" aria-hidden />
          <span className="flex-1 font-semibold">
            {d.orders_to_prepare} order{d.orders_to_prepare === 1 ? "" : "s"} to prepare
          </span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Gross sales" value={money(d.earnings.gross_sales)} />
        <Stat label="AGIZA commission" value={money(d.earnings.commission)} />
        <Stat label="Your earnings" value={money(d.earnings.net_earnings)} strong />
        <Stat label="Payable now" value={money(d.earnings.payable)} hint={`Paid out: ${money(d.earnings.paid_out)}`} />
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Products</h2>
          <Link href="/seller/products" className="text-[14px] font-semibold text-primary hover:underline">
            Manage →
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ["Live", d.products.published],
            ["Waiting for review", d.products.pending_review],
            ["Drafts", d.products.draft],
            ["Changes needed", d.products.rejected],
            ["Hidden", d.products.inactive],
            ["Disabled by AGIZA", d.products.disabled],
          ].map(([label, n]) => (
            <div key={label} className="rounded-md bg-canvas p-3">
              <dt className="text-[13px] text-muted">{label}</dt>
              <dd className="text-xl font-bold text-ink">{n}</dd>
            </div>
          ))}
        </dl>
        {d.low_stock ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-warning">
            <AlertTriangle className="size-4" aria-hidden /> {d.low_stock} item{d.low_stock === 1 ? " is" : "s are"} low on stock (3 or fewer).
          </p>
        ) : null}
        {!Object.values(d.products).some(Boolean) ? (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-muted">
            <Package className="size-4" aria-hidden /> Add your first product to start selling.
          </p>
        ) : null}
      </Card>
    </>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={strong ? "mt-1 text-xl font-bold text-primary" : "mt-1 text-xl font-bold text-ink"}>{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}
