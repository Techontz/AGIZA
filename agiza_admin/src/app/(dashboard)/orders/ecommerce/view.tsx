"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Clock, Package2, Plus, ShoppingCart, TrendingUp, User } from "lucide-react";
import React, { useEffect, useState } from "react";

import { OpenProblemsNotice } from "@/components/ecommerce/fulfillment-issues";
import { useOrderAccess } from "@/components/orders/shared";
import { ShopPaymentBadge, ShopStatusBadge } from "@/components/orders/shop/badges";
import { NewShopOrderDialog } from "@/components/orders/shop/new-order-dialog";
import { ShopOrderDetails } from "@/components/orders/shop/row-details";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { shopOrderKeys, shopOrdersApi, type ShopOrder } from "@/lib/api/services/shop-orders";
import { formatDateTime, formatTSh } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

const th = "px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap";
const COLUMNS = ["Order ID", "Customer", "Items", "Total Amount", "Status", "Payment", "Order Date", "Actions"];

/** Design: "TSh 1.5M" for the revenue card (full amount on hover). */
function compactTSh(value: string | undefined): string {
  const n = Number(value ?? 0);
  return n >= 1_000_000 ? `TSh ${(n / 1_000_000).toFixed(1)}M` : formatTSh(n);
}

export function EcommerceOrdersView() {
  const meta = pageMeta["/orders/ecommerce"];
  const { canEdit } = useOrderAccess();
  const [f, setF] = useUrlFilters({ search: "", status: "all", payment: "all", channel: "all", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced, open: "" });
  }, [debounced, f.search, setF]);

  const query = { search: f.search, status: f.status, payment: f.payment, channel: f.channel, page: Number(f.page), page_size: 20 };
  const list = useQuery({
    queryKey: shopOrderKeys.list(query),
    queryFn: ({ signal }) => shopOrdersApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: shopOrderKeys.stats, queryFn: shopOrdersApi.stats });
  const rows = list.data?.results ?? [];
  const expanded = f.open ? Number(f.open) : null;
  const s = stats.data;
  const filtered = Boolean(f.search || f.status !== "all" || f.payment !== "all" || f.channel !== "all");

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-5" /> New Order
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Pending Orders" value={s?.pending} icon={Clock} tone="orange" loading={stats.isPending} />
        <StatCard label="Processing" value={s?.processing} icon={Package2} tone="blue" loading={stats.isPending} />
        <StatCard label="Shipped" value={s?.shipped} icon={ShoppingCart} tone="green" loading={stats.isPending} />
        <StatCard
          label="Total Revenue"
          value={<span title={s ? formatTSh(s.revenue) : undefined}>{compactTSh(s?.revenue)}</span>}
          icon={TrendingUp}
          tone="purple"
          loading={stats.isPending}
          compactValue
        />
      </div>
      {stats.isError && (
        <p className="-mt-6 mb-6 text-sm text-red-600" role="alert">
          Couldn&apos;t load order totals: {errorText(stats.error)}{" "}
          <button type="button" className="font-medium text-blue-600 hover:text-blue-800" onClick={() => stats.refetch()}>
            Retry
          </button>
        </p>
      )}

      <OpenProblemsNotice className="mb-6" />

      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <SearchInput placeholder="Search by Order ID, Customer, or Email..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search shop orders" />
          <div className="flex gap-3 flex-wrap">
            <Select className="w-auto bg-white" aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value, open: "" })}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select className="w-auto bg-white" aria-label="Filter by payment" value={f.payment} onChange={(e) => setF({ payment: e.target.value, open: "" })}>
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </Select>
            <Select className="w-auto bg-white" aria-label="Filter by channel" value={f.channel} onChange={(e) => setF({ channel: e.target.value, open: "" })}>
              <option value="all">All Channels</option>
              <option value="app">Mobile app</option>
              <option value="web">Online store</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="shop">Physical shop</option>
              <option value="manual">Entered by staff</option>
            </Select>
          </div>
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <Card className="p-12 text-center">
          <ShoppingCart className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">{filtered ? "No orders found" : "No shop orders yet"}</p>
          <p className="text-gray-500 text-sm mt-2">{filtered ? "Try adjusting your filters or search terms" : "Orders from the online store and staff-entered orders appear here."}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {COLUMNS.map((h) => (
                    <th key={h} scope="col" className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.isPending
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {COLUMNS.map((c) => (
                          <td key={c} className="px-6 py-4">
                            <div className="h-4 rounded bg-gray-200 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((o) => <Row key={o.id} order={o} open={expanded === o.id} toggle={() => setF({ open: expanded === o.id ? "" : String(o.id) })} />)}
              </tbody>
            </table>
          </div>
          {list.data && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={(p) => setF({ page: String(p), open: "" })}
              disabled={list.isFetching}
            />
          )}
        </Card>
      )}

      <NewShopOrderDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(o) => {
          setSearch("");
          setF({ search: "", status: "all", payment: "all", channel: "all", open: String(o.id) });
        }}
      />
    </PageContainer>
  );
}

function Row({ order: o, open, toggle }: { order: ShopOrder; open: boolean; toggle: () => void }) {
  const email = o.details.customer_email || o.customer.email;
  const count = o.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <React.Fragment>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-6 py-4">
          <div className="font-semibold text-gray-900 whitespace-nowrap">{o.reference}</div>
        </td>
        <td className="px-6 py-4">
          <div className="flex items-start gap-2">
            <User className="size-4 text-gray-400 mt-1 flex-shrink-0" />
            <div>
              <div className="text-gray-900 font-medium whitespace-nowrap">{o.customer.full_name}</div>
              <div className="text-xs text-gray-500">{email || o.customer.phone}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="text-sm text-gray-900 whitespace-nowrap" title={o.item_details}>
            {o.items.length} item(s)
            {count !== o.items.length && <span className="text-gray-500"> · {count} units</span>}
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(o.total_amount)}</div>
        </td>
        <td className="px-6 py-4">
          <ShopStatusBadge status={o.status} />
        </td>
        <td className="px-6 py-4">
          <ShopPaymentBadge status={o.payment_status} />
        </td>
        <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{formatDateTime(o.created_at)}</td>
        <td className="px-6 py-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${o.reference}`}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
          >
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {open ? "Less" : "Details"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={COLUMNS.length} className="px-6 py-4 bg-gray-50">
            <ShopOrderDetails order={o} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}
