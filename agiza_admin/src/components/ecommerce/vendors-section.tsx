"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, Edit, Eye, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { catalogApi, catalogKeys, type ApprovalStatus, type Vendor } from "@/lib/api/services/catalog";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

import { ApprovalBadge, CommissionTerms, SellerKindTag, VendorLogo } from "./marketplace-ui";
import { DeleteDialog, SectionHeader, compactAmount, useCatalogAccess } from "./shared";
import { ProfitAgreementModal, VendorModal } from "./vendor-modals";
import { VendorProfile } from "./vendor-profile";

const th = "px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap";
const HEADERS = ["Vendor", "Contact / Owner", "City", "Status", "Commission", "Products", "Total Sales", "Submitted / Joined", "Actions"];

type Tab = "all" | ApprovalStatus;
const TABS: { value: Tab; label: string; activeClass?: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending", activeClass: "bg-amber-600" },
  { value: "under_review", label: "Under review" },
  { value: "changes_requested", label: "Changes requested", activeClass: "bg-orange-600" },
  { value: "approved", label: "Approved", activeClass: "bg-green-600" },
  { value: "rejected", label: "Rejected", activeClass: "bg-red-600" },
  { value: "suspended", label: "Suspended", activeClass: "bg-gray-700" },
];
const isTab = (v: string): v is Tab => TABS.some((t) => t.value === v);

export function VendorsSection({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  const { canEdit } = useCatalogAccess();
  const [f, setF] = useUrlFilters({ vq: "", vpage: "1", vstatus: "all", vkind: "all", vendor: "", vtab: "" });
  const [search, setSearch] = useState(f.vq);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.vq) setF({ vq: debounced, vpage: "1" });
  }, [debounced, f.vq, setF]);

  const tab: Tab = isTab(f.vstatus) ? f.vstatus : "all";
  const query = {
    search: f.vq,
    approval_status: tab === "all" ? undefined : tab,
    self_service: f.vkind === "self" ? "true" : f.vkind === "managed" ? "false" : undefined,
    page: Number(f.vpage) || 1,
    page_size: 20,
  };
  const list = useQuery({
    queryKey: catalogKeys.vendorList(query),
    queryFn: ({ signal }) => catalogApi.vendors.list(query, signal),
    placeholderData: keepPreviousData,
    enabled: !f.vendor,
  });
  const counts = useQuery({ queryKey: catalogKeys.vendorCounts, queryFn: ({ signal }) => catalogApi.vendors.counts(signal), enabled: !f.vendor });
  const rows = list.data?.results ?? [];
  const filtered = Boolean(f.vq || tab !== "all" || f.vkind !== "all");

  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [agreement, setAgreement] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState<Vendor | null>(null);

  const openVendor = (id: number | "") => setF({ vendor: id === "" ? "" : String(id), vtab: "", vpage: f.vpage });

  if (f.vendor && Number(f.vendor) > 0) {
    return <VendorProfile vendorId={Number(f.vendor)} tab={f.vtab} onTab={(t) => setF({ vtab: t, vpage: f.vpage })} onBack={() => openVendor("")} />;
  }

  return (
    <>
      <SectionHeader
        title={title}
        description={description}
        onBack={onBack}
        actions={
          canEdit && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
            >
              <Plus className="size-5" />
              Add New Vendor
            </button>
          )
        }
      />

      <Card className="p-6 mb-6 space-y-4">
        <PillTabs
          value={tab}
          onChange={(v) => setF({ vstatus: v, vpage: "1" })}
          options={TABS.map((t) => {
            const n = counts.data?.[t.value];
            return {
              value: t.value,
              activeClass: t.activeClass,
              label: (
                <>
                  {t.label}
                  {n !== undefined && (
                    <span className={cn("text-xs rounded-full px-2 py-0.5", tab === t.value ? "bg-white/20" : "bg-white text-gray-600")}>{n}</span>
                  )}
                </>
              ),
            };
          })}
        />
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <SearchInput
            placeholder="Search by name, reference, phone or contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search vendors"
            className="md:max-w-md"
          />
          <Select className="w-full md:w-auto" aria-label="Filter by vendor type" value={f.vkind} onChange={(e) => setF({ vkind: e.target.value, vpage: "1" })}>
            <option value="all">All vendor types</option>
            <option value="self">Self-service stores</option>
            <option value="managed">Staff-managed</option>
          </Select>
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? "No vendors found" : "No vendors yet"}
          description={filtered ? "Try a different search term or filter" : "Add the sellers whose products you list, with their profit agreement."}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {HEADERS.map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={cn("divide-y divide-gray-200", list.isFetching && !list.isPending && "opacity-60 transition-opacity")}>
                {list.isPending
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: HEADERS.length }).map((__, j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 rounded bg-gray-200 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((vendor) => (
                      <tr key={vendor.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <VendorLogo vendor={vendor} />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => openVendor(vendor.id)}
                                className="font-semibold text-gray-900 hover:text-blue-600 flex items-center gap-1.5 whitespace-nowrap text-left"
                              >
                                {vendor.name}
                                {vendor.verified && <BadgeCheck className="size-4 text-blue-600" aria-label="Verified vendor" />}
                              </button>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-gray-500">{vendor.reference}</span>
                                <SellerKindTag selfService={vendor.self_service} />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            {vendor.owner ? (
                              <>
                                <div className="text-gray-900 whitespace-nowrap">{vendor.owner.name}</div>
                                <div className="text-gray-500 whitespace-nowrap">{vendor.owner.phone}</div>
                              </>
                            ) : (
                              <>
                                <div className="text-gray-900">{vendor.contact_person || vendor.email || "—"}</div>
                                <div className="text-gray-500 whitespace-nowrap">{vendor.phone}</div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 whitespace-nowrap">{vendor.city_name || vendor.location || "—"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <ApprovalBadge status={vendor.approval_status} />
                            {vendor.status === "inactive" && <span className="text-xs text-gray-500">Inactive</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <CommissionTerms vendor={vendor} />
                          {canEdit && (
                            <button type="button" onClick={() => setAgreement(vendor)} className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1">
                              <Edit className="size-3" />
                              Edit Agreement
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-gray-900">{vendor.products_count}</div>
                          {vendor.pending_products > 0 && (
                            <div className="text-xs text-amber-700 whitespace-nowrap">{vendor.pending_products} pending review</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-gray-900 whitespace-nowrap" title={`TSh ${Number(vendor.total_sales).toLocaleString("en-US")}`}>
                            TSh {compactAmount(vendor.total_sales)}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">
                            {vendor.orders_count} order{vendor.orders_count === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 whitespace-nowrap">
                            {vendor.approval_status === "approved" || vendor.approval_status === "suspended"
                              ? formatDate(vendor.joined_date ?? vendor.created_at)
                              : formatDate(vendor.submitted_at ?? vendor.created_at)}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">
                            {vendor.approval_status === "approved" || vendor.approval_status === "suspended" ? "Joined" : "Submitted"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => openVendor(vendor.id)} className="text-gray-600 hover:text-blue-600" aria-label={`View ${vendor.name}`} title="View vendor profile">
                              <Eye className="size-5" />
                            </button>
                            {canEdit && !vendor.self_service && (
                              <>
                                <button type="button" onClick={() => setEditing(vendor)} className="text-blue-600 hover:text-blue-800" aria-label={`Edit ${vendor.name}`} title="Edit vendor">
                                  <Edit className="size-5" />
                                </button>
                                <button type="button" onClick={() => setDeleting(vendor)} className="text-red-600 hover:text-red-800" aria-label={`Delete ${vendor.name}`} title="Delete vendor">
                                  <Trash2 className="size-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {list.data && list.data.total_pages > 1 && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={(p) => setF({ vpage: String(p) })}
              disabled={list.isFetching}
            />
          )}
        </Card>
      )}

      {editing && <VendorModal vendor={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {agreement && <ProfitAgreementModal vendor={agreement} onClose={() => setAgreement(null)} />}
      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Vendor"
        name={deleting?.name ?? ""}
        onDelete={() => catalogApi.vendors.remove(deleting!.id)}
        onDeactivate={deleting?.status === "active" ? () => catalogApi.vendors.update(deleting.id, { status: "inactive" }) : undefined}
        deactivateLabel="Mark Inactive Instead"
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
