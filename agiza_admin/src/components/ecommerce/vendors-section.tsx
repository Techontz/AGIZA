"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, DollarSign, Edit, Percent, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { catalogApi, catalogKeys, type Vendor } from "@/lib/api/services/catalog";
import { formatDate } from "@/lib/format";

import { DeleteDialog, SectionHeader, compactAmount, useCatalogAccess } from "./shared";
import { ProfitAgreementModal, VendorModal } from "./vendor-modals";

const th = "px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap";
const HEADERS = ["Vendor", "Contact", "Location", "Profit Agreement", "Products", "Total Sales", "Status", "Actions"];

export function VendorsSection({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  const { canEdit } = useCatalogAccess();
  const [f, setF] = useUrlFilters({ vq: "", vpage: "1" });
  const [search, setSearch] = useState(f.vq);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.vq) setF({ vq: debounced, vpage: "1" });
  }, [debounced, f.vq, setF]);

  const query = { search: f.vq, page: Number(f.vpage) || 1, page_size: 20 };
  const list = useQuery({
    queryKey: catalogKeys.vendorList(query),
    queryFn: ({ signal }) => catalogApi.vendors.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];

  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [agreement, setAgreement] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState<Vendor | null>(null);

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

      <Card className="p-6 mb-6">
        <SearchInput
          placeholder="Search vendors by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search vendors"
          className="md:max-w-md"
        />
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={f.vq ? "No vendors found" : "No vendors yet"}
          description={f.vq ? "Try a different search term" : "Add the sellers whose products you list, with their profit agreement."}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {HEADERS.map((h) => (h === "Actions" && !canEdit ? null : <th key={h} className={th}>{h}</th>))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.isPending
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: canEdit ? 8 : 7 }).map((__, j) => (
                          <td key={j} className="px-6 py-4"><div className="h-4 rounded bg-gray-200 animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  : rows.map((vendor) => (
                      <tr key={vendor.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900 flex items-center gap-1.5 whitespace-nowrap">
                            {vendor.name}
                            {vendor.verified && <BadgeCheck className="size-4 text-blue-600" aria-label="Verified vendor" />}
                          </div>
                          <div className="text-sm text-gray-500">{vendor.reference}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="text-gray-900">{vendor.email || "—"}</div>
                            <div className="text-gray-500 whitespace-nowrap">{vendor.phone}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><div className="text-sm text-gray-900">{vendor.location || "—"}</div></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {vendor.profit_type === "fixed" ? (
                              <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded whitespace-nowrap">
                                <DollarSign className="size-4" />
                                <span className="text-sm font-semibold">TSh {Number(vendor.profit_value).toLocaleString("en-US")}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                <Percent className="size-4" />
                                <span className="text-sm font-semibold">{Number(vendor.profit_value)}%</span>
                              </div>
                            )}
                            <div className="text-xs text-gray-500 whitespace-nowrap">{vendor.profit_scope === "all" ? "(All Products)" : "(Per Product)"}</div>
                          </div>
                          {canEdit && (
                            <button type="button" onClick={() => setAgreement(vendor)} className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1">
                              <Edit className="size-3" />
                              Edit Agreement
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4"><div className="text-sm font-semibold text-gray-900">{vendor.products_count}</div></td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-gray-900 whitespace-nowrap" title={`TSh ${Number(vendor.total_sales).toLocaleString("en-US")}`}>
                            TSh {compactAmount(vendor.total_sales)}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">Since {formatDate(vendor.joined_date ?? vendor.created_at)}</div>
                        </td>
                        <td className="px-6 py-4">
                          {vendor.status === "active" ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Active</span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">Inactive</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setEditing(vendor)} className="text-blue-600 hover:text-blue-800" aria-label={`Edit ${vendor.name}`} title="Edit vendor">
                                <Edit className="size-5" />
                              </button>
                              <button type="button" onClick={() => setDeleting(vendor)} className="text-red-600 hover:text-red-800" aria-label={`Delete ${vendor.name}`} title="Delete vendor">
                                <Trash2 className="size-5" />
                              </button>
                            </div>
                          </td>
                        )}
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
