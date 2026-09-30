"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, LayoutDashboard, Package, Settings, ShoppingCart, Star, Store as StoreIcon, Undo2, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ApiError, errorMessage } from "@/lib/api/client";
import { sellerApi } from "@/lib/api/endpoints";
import type { SellerStore } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { dateTime, storeHref } from "@/lib/format";

import { StoreAvatar } from "../store/store-avatar";
import { Badge } from "../ui/badge";
import { ButtonLink } from "../ui/button";
import { Container } from "../ui/container";
import { EmptyState, Notice, Skeleton } from "../ui/states";
import { ApplicationForm, STORE_KEY } from "./application-form";

const NAV = [
  { href: "/seller", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/seller/products", label: "Products", icon: Package },
  { href: "/seller/orders", label: "Orders", icon: ShoppingCart },
  { href: "/seller/returns", label: "Returns", icon: Undo2 },
  { href: "/seller/reviews", label: "Reviews", icon: Star },
  { href: "/seller/earnings", label: "Earnings", icon: Wallet },
  { href: "/seller/store", label: "Store settings", icon: Settings },
];

export const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  under_review: "info",
  changes_requested: "warning",
  approved: "success",
  rejected: "danger",
  suspended: "danger",
};

export function useStore() {
  return useQuery({ queryKey: STORE_KEY, queryFn: sellerApi.store, retry: false });
}

export function SellerGate({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const pathname = usePathname();
  if (store.isLoading) {
    return (
      <Container className="py-8">
        <Skeleton className="h-96" />
      </Container>
    );
  }
  if (store.error instanceof ApiError && store.error.status === 404) {
    return (
      <Container className="py-10">
        <EmptyState
          icon={StoreIcon}
          title="You don't have a store yet"
          text="Apply to sell on AGIZA with this account. AGIZA reviews every store before it can sell."
          action={<ButtonLink href="/sell/apply">Apply to sell</ButtonLink>}
        />
      </Container>
    );
  }
  if (store.isError || !store.data) {
    return (
      <Container className="py-10">
        <Notice tone="danger">{errorMessage(store.error)}</Notice>
      </Container>
    );
  }
  const s = store.data;
  if (s.approval_status !== "approved" && s.approval_status !== "suspended") return <Application store={s} />;

  return (
    <Container className="grid items-start gap-6 py-6 sm:py-8 lg:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="Seller" className="lg:sticky lg:top-32">
        <Link href={storeHref(s)} className="mb-3 hidden items-center gap-3 rounded-lg bg-surface p-3 shadow-card hover:shadow-raised lg:flex">
          <StoreAvatar seller={{ name: s.name, logo: s.logo, is_agiza: false }} size={40} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{s.name}</span>
            <span className="text-[12px] text-primary">View public store →</span>
          </span>
        </Link>
        <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:rounded-lg lg:bg-surface lg:p-2 lg:shadow-card">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-[14px] font-medium whitespace-nowrap", active ? "bg-primary-soft text-primary" : "bg-surface text-ink hover:bg-canvas lg:bg-transparent")}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 space-y-4">
        {s.approval_status === "suspended" ? (
          <Notice tone="danger">
            <span className="font-semibold">Your store is suspended.</span> Customers can&apos;t see your products and nothing can be changed.
            {s.review_note ? ` Reason: ${s.review_note}` : ""} Contact AGIZA to resolve it.
          </Notice>
        ) : null}
        {children}
      </div>
    </Container>
  );
}

function Application({ store }: { store: SellerStore }) {
  const [editing, setEditing] = useState(false);
  const icon = store.approval_status === "rejected" ? XCircle : store.approval_status === "changes_requested" ? AlertTriangle : Clock;
  const Icon = icon;
  const text: Record<string, string> = {
    pending: "Your application has been received. AGIZA will review it soon — you can still edit it until the review starts.",
    under_review: "AGIZA is reviewing your application. We'll notify you when there's a decision.",
    changes_requested: "AGIZA needs a few changes before approving your store. Update your application and resubmit it.",
    rejected: "Your application wasn't approved.",
  };
  return (
    <Container className="max-w-3xl py-8 sm:py-10">
      <div className="rounded-lg bg-surface p-6 shadow-card sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-brand">
            <Icon className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold text-ink">{store.name}</span>
              <Badge tone={STATUS_TONE[store.approval_status]}>{store.approval_status_display}</Badge>
            </p>
            <p className="mt-1 text-muted">{text[store.approval_status]}</p>
            {store.review_note && store.approval_status !== "pending" ? (
              <Notice tone={store.approval_status === "rejected" ? "danger" : "warning"} className="mt-3">
                <span className="font-semibold">Message from AGIZA:</span> {store.review_note}
              </Notice>
            ) : null}
          </div>
        </div>
        {store.history.length ? (
          <ol className="mt-6 space-y-2 border-t border-line pt-4 text-[14px]">
            {store.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-ink">{h.status_display}</span>
                <span className="text-muted">{dateTime(h.at)}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {store.can_edit_application ? (
          <div className="mt-6 border-t border-line pt-6">
            {editing ? (
              <ApplicationForm store={store} onDone={() => setEditing(false)} />
            ) : (
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setEditing(true)}>
                {store.approval_status === "changes_requested" ? "Update and resubmit my application" : "Edit my application"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </Container>
  );
}
