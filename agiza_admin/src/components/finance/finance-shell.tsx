"use client";

import { useQuery } from "@tanstack/react-query";
import { DollarSign, FileText, Receipt, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import { financeApi, financeKeys } from "@/lib/api/services/finance";
import { formatTSh } from "@/lib/format";

import { formatMillions } from "./shared";

export type FinanceTab = "invoices" | "payments" | "wallets";

const TABS: { id: FinanceTab; label: string; href: string; icon: LucideIcon }[] = [
  { id: "invoices", label: "Create Invoice", href: "/finance/invoices", icon: FileText },
  { id: "payments", label: "Order Payments", href: "/finance/payments", icon: Receipt },
  { id: "wallets", label: "Wallets & Installments", href: "/finance/wallets", icon: Wallet },
];

const CARDS = [
  { key: "revenue", label: "Total Revenue", icon: DollarSign, box: "from-blue-50 to-blue-100 border-blue-200", circle: "bg-blue-600", label_: "text-blue-800", value: "text-blue-900" },
  { key: "paid", label: "Total Paid", icon: Wallet, box: "from-green-50 to-green-100 border-green-200", circle: "bg-green-600", label_: "text-green-800", value: "text-green-900" },
  { key: "profit", label: "Total Profit", icon: DollarSign, box: "from-purple-50 to-purple-100 border-purple-200", circle: "bg-purple-600", label_: "text-purple-800", value: "text-purple-900" },
  { key: "due", label: "Amount Due", icon: Receipt, box: "from-red-50 to-red-100 border-red-200", circle: "bg-red-600", label_: "text-red-800", value: "text-red-900" },
] as const;

/** Finance Management header, gradient stat cards and the tab buttons (one route per tab). */
export function FinanceShell({ active, children }: { active: FinanceTab; children: React.ReactNode }) {
  const stats = useQuery({ queryKey: financeKeys.stats, queryFn: financeApi.stats });
  const s = stats.data;

  return (
    <PageContainer>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Finance Management</h1>
        <p className="text-gray-600">Track payments, invoices, and customer wallets</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className={cn("bg-gradient-to-br rounded-lg shadow-sm border p-6", c.box)}>
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-3 rounded-full", c.circle)}>
                  <Icon className="size-6 text-white" />
                </div>
              </div>
              <p className={cn("text-sm mb-1", c.label_)}>{c.label}</p>
              {s ? (
                <p className={cn("text-3xl font-bold", c.value)} title={formatTSh(s[c.key])}>
                  {formatMillions(s[c.key])}
                </p>
              ) : stats.isError ? (
                <p className={cn("text-3xl font-bold", c.value)} title="Could not load">—</p>
              ) : (
                <div className="h-9 w-32 animate-pulse rounded bg-white/60" />
              )}
            </div>
          );
        })}
      </div>

      <nav className="flex gap-2 mb-8 overflow-x-auto no-scrollbar" aria-label="Finance sections">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap",
                on ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              )}
            >
              <Icon className="size-5" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </PageContainer>
  );
}
