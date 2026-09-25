"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Edit, Plus, Settings, Trash2 } from "lucide-react";
import { useState } from "react";

import { useEngineAccess, useEngineMutation } from "@/components/shipping-engine/hooks";
import { OverrideForm } from "@/components/shipping-engine/override-form";
import { Btn, ConfirmDialog, EnginePage, IconButton, InfoBanner, PageHeader, SectionCard, StatusBadge, td, th } from "@/components/shipping-engine/ui";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { engine, seKeys, type RuleOverride } from "@/lib/api/services/shipping-engine";

const HEAD = ["ID", "Route", "Destination", "Profile", "Original Rule", "Override Price", "Reason", "Valid Period", "Status", "Actions"];
const dateFmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function periodStatus(o: RuleOverride): { status: string; label: string } {
  if (o.status !== "active") return { status: "inactive", label: "Inactive" };
  if (o.is_current) return { status: "active", label: "Active" };
  const today = new Date().toISOString().slice(0, 10);
  return o.start_date > today ? { status: "pending", label: "Scheduled" } : { status: "inactive", label: "Expired" };
}

export function OverridesView() {
  const { canEdit, canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({ page: "1", new: "", edit: "" });
  const query = { page: Number(f.page), page_size: 50 };
  const q = useQuery({
    queryKey: seKeys.list("overrides", query),
    queryFn: ({ signal }) => engine.overrides.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = q.data?.results ?? [];
  const editing = f.edit ? rows.find((o) => String(o.id) === f.edit) ?? null : null;
  const [toDelete, setToDelete] = useState<RuleOverride | null>(null);
  const remove = useEngineMutation((o: RuleOverride) => engine.overrides.remove(o.id), {
    success: "Override deleted",
    onSuccess: () => setToDelete(null),
  });

  return (
    <EnginePage>
      <OverrideForm open={f.new === "1" || Boolean(editing)} onClose={() => setF({ new: "", edit: "" })} override={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete override"
        message={`Delete ${toDelete?.code}? The deletion is recorded in the audit log.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title="Overrides"
        description="Create exceptions to existing rules for specific destinations, time periods, or promotions — without rebuilding zones."
        actions={canEdit && <Btn variant="primary" icon={Plus} onClick={() => setF({ new: "1" })}>Create Override</Btn>}
      />
      <InfoBanner tone="yellow" icon={AlertTriangle} className="mb-6">
        Overrides take priority over general zone rules for the specified destination and period. All overrides are audited automatically.
      </InfoBanner>
      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <SectionCard title="Active Overrides & Audit Trail">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {HEAD.map((h) => (
                    <th key={h} className={th}>
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
                      <Settings className="size-10 mx-auto mb-3 text-gray-200" />
                      <p className="text-sm">No overrides yet.</p>
                      {canEdit && (
                        <button type="button" onClick={() => setF({ new: "1" })} className="mt-2 text-blue-600 text-sm hover:underline">
                          Create one
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((o) => {
                    const ps = periodStatus(o);
                    return (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className={td}>
                          <div className="font-mono text-xs text-gray-400">{o.code}</div>
                          {o.created_by_name && <div className="text-[11px] text-gray-400 whitespace-nowrap">by {o.created_by_name}</div>}
                        </td>
                        <td className={`${td} text-xs text-gray-700 font-medium whitespace-nowrap`}>{o.route_label}</td>
                        <td className={`${td} text-xs text-gray-700`}>{o.destination_label}</td>
                        <td className={td}>
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs whitespace-nowrap">{o.profile_name ?? "All Products"}</span>
                        </td>
                        <td className={`${td} text-xs text-gray-500 line-through whitespace-nowrap`}>{o.original_rule?.rate_display ?? "—"}</td>
                        <td className={`${td} text-xs font-bold text-gray-900 whitespace-nowrap`}>{o.override_rate_display}</td>
                        <td className={`${td} text-xs text-gray-500 max-w-40`}>{o.reason}</td>
                        <td className={`${td} text-xs text-gray-500 whitespace-nowrap`}>
                          {dateFmt(o.start_date)} – {dateFmt(o.end_date)}
                        </td>
                        <td className={td}>
                          <StatusBadge status={ps.status} label={ps.label} />
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-1">
                            {canEdit && <IconButton icon={Edit} size="sm" label={`Edit ${o.code}`} onClick={() => setF({ edit: String(o.id) })} />}
                            {canManage && <IconButton icon={Trash2} size="sm" label={`Delete ${o.code}`} onClick={() => setToDelete(o)} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
