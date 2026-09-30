"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle, CreditCard, DollarSign, Layers, Percent, RotateCcw, ShoppingBag, Store, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { errorText } from "@/lib/api/errors";
import { catalogApi, catalogKeys } from "@/lib/api/services/catalog";
import { marketplaceApi, marketplaceKeys, type VendorEarningsRow } from "@/lib/api/services/marketplace";
import { formatTSh } from "@/lib/format";

import { SellerKindTag, payoutAccountText } from "./marketplace-ui";
import { PayoutBatchModal, PayoutModal, PayoutsTable, useCanRecordPayout } from "./payouts";
import { compactAmount } from "./shared";

const money = (v: string) => <span title={formatTSh(v)}>TSh {compactAmount(v)}</span>;

/** Vendor Earnings & Payouts: marketplace totals, a row per vendor, and payout history. */
export function VendorEarningsSection() {
  const canPay = useCanRecordPayout();
  const earnings = useQuery({ queryKey: marketplaceKeys.earnings({}), queryFn: ({ signal }) => marketplaceApi.earnings({}, signal) });
  const [search, setSearch] = useState("");
  const [show, setShow] = useState("all");
  const [paying, setPaying] = useState<VendorEarningsRow | null>(null);
  const [batching, setBatching] = useState(false);
  const m = earnings.data?.marketplace;
  const loading = earnings.isPending;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (earnings.data?.vendors ?? []).filter(
      (r) => (!term || r.vendor.name.toLowerCase().includes(term)) && (show !== "payable" || Number(r.payable) > 0),
    );
  }, [earnings.data, search, show]);

  const headers = [
    "Vendor",
    "Orders",
    "Gross Sales",
    "Commission",
    "Vendor Net",
    "Refunds",
    "Pending",
    "Payable",
    "In Payout",
    "Paid Out",
    ...(canPay ? ["Actions"] : []),
  ];

  return (
    <div className="space-y-6">
      {earnings.isError && !earnings.data ? (
        <ErrorState message={errorText(earnings.error)} onRetry={() => earnings.refetch()} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard label="Gross Sales" value={m ? money(m.gross_sales) : "—"} icon={DollarSign} tone="blue" loading={loading} compactValue />
          <StatCard label="AGIZA Own Sales" value={m ? money(m.agiza_own_sales) : "—"} icon={Store} tone="indigo" loading={loading} compactValue />
          <StatCard label="Vendor Sales" value={m ? money(m.vendor_sales) : "—"} icon={ShoppingBag} tone="cyan" loading={loading} compactValue />
          <StatCard label="Platform Commission" value={m ? money(m.platform_commission) : "—"} icon={Percent} tone="purple" loading={loading} compactValue />
          <StatCard label="Vendor Earnings" value={m ? money(m.vendor_earnings) : "—"} icon={Wallet} tone="green" loading={loading} compactValue />
          <StatCard label="Delivery Fees" value={m ? money(m.shipping_fees) : "—"} icon={Truck} tone="orange" loading={loading} compactValue />
          <StatCard label="Refunds to Customers" value={m ? money(m.refunds_to_customers) : "—"} icon={RotateCcw} tone="red" loading={loading} compactValue />
          <StatCard label="Payable to Vendors" value={m ? money(m.payable_to_vendors) : "—"} icon={CreditCard} tone="yellow" loading={loading} compactValue />
          <StatCard label="Paid to Vendors" value={m ? money(m.paid_to_vendors) : "—"} icon={CheckCircle} tone="gray" loading={loading} compactValue />
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="p-6 border-b border-gray-200 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Earnings by Vendor</h2>
              <p className="text-sm text-gray-600 mt-1">
                Orders not cancelled. Earnings are <span className="font-medium">pending</span> until the order is delivered and fully paid, then{" "}
                <span className="font-medium">payable</span> (less refunds, plus adjustments) until a payout is made.
              </p>
            </div>
            {canPay && (
              <Button className="flex-shrink-0" onClick={() => setBatching(true)} disabled={!earnings.data}>
                <Layers className="size-4" /> Prepare Payout Batch
              </Button>
            )}
          </div>
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <SearchInput placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search vendors" className="md:max-w-md" />
            <Select className="w-full md:w-auto" aria-label="Show vendors" value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="all">All vendors with sales</option>
              <option value="payable">With a payable balance</option>
            </Select>
          </div>
        </div>
        {!loading && rows.length === 0 && !earnings.isError ? (
          <EmptyState
            bare
            icon={Wallet}
            title={search || show !== "all" ? "No vendors match" : "No vendor sales yet"}
            description={search || show !== "all" ? "Try a different search or filter." : "Vendor earnings appear once customers order vendors' products."}
          />
        ) : (
          <Table>
            <THead>
              {headers.map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </THead>
            <TBody>
              {loading ? (
                <TableSkeletonRows rows={4} columns={headers.length} />
              ) : (
                rows.map((r) => (
                  <Tr key={r.vendor.id}>
                    <Td>
                      <Link href={`/ecommerce?section=vendors&vendor=${r.vendor.id}&vtab=earnings`} className="font-semibold text-gray-900 hover:text-blue-600 whitespace-nowrap">
                        {r.vendor.name}
                      </Link>
                      <div className="mt-0.5">
                        <SellerKindTag selfService={r.vendor.self_service} />
                      </div>
                    </Td>
                    <Td className="text-sm text-gray-700">{r.orders}</Td>
                    <Td className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatTSh(r.gross_sales)}</Td>
                    <Td className="text-sm text-gray-700 whitespace-nowrap">{formatTSh(r.commission)}</Td>
                    <Td className="text-sm font-semibold text-green-700 whitespace-nowrap">{formatTSh(r.vendor_net)}</Td>
                    <Td className={`text-sm whitespace-nowrap ${Number(r.refunds) > 0 ? "text-red-700" : "text-gray-400"}`}>{formatTSh(r.refunds)}</Td>
                    <Td className="text-sm text-amber-700 whitespace-nowrap">{formatTSh(r.pending)}</Td>
                    <Td className="text-sm font-semibold text-blue-700 whitespace-nowrap">{formatTSh(r.payable)}</Td>
                    <Td className={`text-sm whitespace-nowrap ${Number(r.in_payout) > 0 ? "text-amber-700 font-medium" : "text-gray-400"}`}>{formatTSh(r.in_payout)}</Td>
                    <Td className="text-sm text-gray-700 whitespace-nowrap">{formatTSh(r.paid_out)}</Td>
                    {canPay && (
                      <Td>
                        {Number(r.in_payout) > 0 ? (
                          <span className="text-xs text-amber-700 whitespace-nowrap">Payout processing</span>
                        ) : Number(r.payable) > 0 ? (
                          <Button size="sm" onClick={() => setPaying(r)}>
                            <Wallet className="size-4" /> Record Payout
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-400">Nothing payable</span>
                        )}
                      </Td>
                    )}
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Payout History</h2>
          <p className="text-sm text-gray-600 mt-1">
            Transfers to vendors. A <span className="font-medium">processing</span> payout is marked paid with its transaction reference, or failed; a paid one can be
            reversed if the money came back.
          </p>
        </div>
        <PayoutsTable pageSize={20} showFilter />
      </Card>

      {paying && <PayoutForRow row={paying} onClose={() => setPaying(null)} />}
      {batching && earnings.data && <PayoutBatchModal vendors={earnings.data.vendors} onClose={() => setBatching(false)} />}
    </div>
  );
}

/** Loads the vendor's payout account so Finance sees where to send the money. */
function PayoutForRow({ row, onClose }: { row: VendorEarningsRow; onClose: () => void }) {
  const vendor = useQuery({ queryKey: catalogKeys.vendor(row.vendor.id), queryFn: ({ signal }) => catalogApi.vendors.get(row.vendor.id, signal) });
  return (
    <PayoutModal
      vendor={{ id: row.vendor.id, name: row.vendor.name }}
      payable={row.payable}
      payoutAccount={vendor.data ? payoutAccountText(vendor.data) : undefined}
      onClose={onClose}
    />
  );
}
