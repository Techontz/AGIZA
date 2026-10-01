"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Edit, Landmark, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { useEngineAccess, useEngineMutation } from "@/components/shipping-engine/hooks";
import { ImportChargeForm } from "@/components/shipping-engine/import-charge-form";
import { Btn, ConfirmDialog, EnginePage, IconButton, InfoBanner, PageHeader, SectionCard, StatusBadge, td, th } from "@/components/shipping-engine/ui";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { engine, seKeys, type ImportCharge } from "@/lib/api/services/shipping-engine";

const HEAD = ["ID", "Name", "Kind", "Applies to", "Amount", "At checkout", "Status", "Actions"];

/** Customs / import charges on imported goods (Shipping Engine). Staff enter the rates; none are built in. */
export function ImportChargesView() {
  const { canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({ page: "1", new: "", edit: "" });
  const query = { page: Number(f.page), page_size: 50 };
  const q = useQuery({
    queryKey: seKeys.list("import-charges", query),
    queryFn: ({ signal }) => engine.importCharges.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = q.data?.results ?? [];
  const editing = f.edit ? rows.find((c) => String(c.id) === f.edit) ?? null : null;
  const [toDelete, setToDelete] = useState<ImportCharge | null>(null);
  const remove = useEngineMutation((c: ImportCharge) => engine.importCharges.remove(c.id), {
    success: "Import charge deleted",
    onSuccess: () => setToDelete(null),
  });

  return (
    <EnginePage>
      <ImportChargeForm open={f.new === "1" || Boolean(editing)} onClose={() => setF({ new: "", edit: "" })} charge={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete import charge"
        message={`Delete ${toDelete?.code}? Orders already placed keep the charges they were quoted. The deletion is recorded in the audit log.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title="Import Charges"
        description="Customs duty, import VAT and other charges on imported products. Checkout applies the most specific active rule of each kind."
        actions={canManage && <Btn variant="primary" icon={Plus} onClick={() => setF({ new: "1" })}>Create Import Charge</Btn>}
      />
      <InfoBanner tone="yellow" icon={Landmark} className="mb-6">
        AGIZA does not ship any tax rates. Enter the rates that legally apply. Imported products with no customs duty rule are shown
        to customers as &ldquo;Customs / import charges are not included and may be payable separately&rdquo;.
      </InfoBanner>
      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <SectionCard title="Import charge rules">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {HEAD.map((h, i) => (
                    <th key={h} className={i === HEAD.length - 1 ? `${th} sticky right-0 bg-white` : th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.isPending ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {HEAD.map((__, j) => (
                        <td key={j} className={td}>
                          <div className="h-4 rounded bg-gray-100 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={HEAD.length} className="px-4 py-12 text-center text-gray-400">
                      <Landmark className="size-10 mx-auto mb-3 text-gray-200" />
                      <p className="text-sm">No import charges configured — customers are told customs aren&apos;t included.</p>
                      {canManage && (
                        <button type="button" onClick={() => setF({ new: "1" })} className="mt-2 text-blue-600 text-sm hover:underline">
                          Create one
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className={td}>
                        <div className="font-mono text-xs text-gray-400 whitespace-nowrap">{c.code}</div>
                        {c.created_by_name && <div className="text-[11px] text-gray-400 whitespace-nowrap">by {c.created_by_name}</div>}
                      </td>
                      <td className={`${td} text-xs text-gray-900 font-medium`}>{c.name}</td>
                      <td className={`${td} text-xs text-gray-600 whitespace-nowrap`}>{c.kind_display}</td>
                      <td className={td}>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs">{c.applies_to_label}</span>
                      </td>
                      <td className={`${td} text-xs font-bold text-gray-900 whitespace-nowrap`}>{c.rate_display}</td>
                      <td className={`${td} text-xs text-gray-600 whitespace-nowrap`}>{c.treatment_display}</td>
                      <td className={td}>
                        <StatusBadge status={c.status} label={c.status_display} />
                      </td>
                      <td className={`${td} sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]`}>
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <IconButton icon={Edit} size="sm" label={`Edit ${c.code}`} onClick={() => setF({ edit: String(c.id) })} />
                            <IconButton icon={Trash2} size="sm" label={`Delete ${c.code}`} onClick={() => setToDelete(c)} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {q.data && q.data.total_pages > 1 && (
            <Pagination
              page={q.data.page}
              pageSize={q.data.page_size}
              count={q.data.count}
              totalPages={q.data.total_pages}
              onPageChange={(p) => setF({ page: String(p) })}
              disabled={q.isFetching}
            />
          )}
        </SectionCard>
      )}
    </EnginePage>
  );
}
