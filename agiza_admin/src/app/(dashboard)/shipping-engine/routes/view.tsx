"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FilterPopover } from "@/components/shipping-engine/filter-popover";
import { useEngineAccess, useEngineMutation, useMethodOptions } from "@/components/shipping-engine/hooks";
import { RouteForm } from "@/components/shipping-engine/route-form";
import {
  Btn,
  ConfirmDialog,
  EnginePage,
  Input,
  PageHeader,
  RowMenu,
  SectionCard,
  Select,
  StatusBadge,
  Tabs,
  td,
  th,
} from "@/components/shipping-engine/ui";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { engine, seKeys, type Route, type Scope } from "@/lib/api/services/shipping-engine";
import { pageMeta } from "@/lib/nav";

const TABS: { id: Scope; label: string }[] = [
  { id: "local", label: "Local Delivery (Tanzania)" },
  { id: "international", label: "International Shipping" },
];

export function RoutesView() {
  const meta = pageMeta["/shipping-engine/routes"];
  const router = useRouter();
  const { canEdit, canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({ tab: "local", search: "", status: "all", method: "all", page: "1", new: "", edit: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const query = { type: f.tab, search: f.search, status: f.status, method: f.method, page: Number(f.page), page_size: 50 };
  const q = useQuery({
    queryKey: seKeys.list("routes", query),
    queryFn: ({ signal }) => engine.routes.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const methods = useMethodOptions();

  const editing = f.edit ? q.data?.results.find((r) => String(r.id) === f.edit) ?? null : null;
  const formOpen = f.new === "1" || Boolean(editing);
  const closeForm = () => setF({ new: "", edit: "" });

  const [toDelete, setToDelete] = useState<Route | null>(null);
  const toggle = useEngineMutation((r: Route) => engine.routes.update(r.id, { status: r.status === "active" ? "inactive" : "active" }), {
    success: (r) => `Route ${(r as Route).status === "active" ? "activated" : "deactivated"}`,
  });
  const remove = useEngineMutation((r: Route) => engine.routes.remove(r.id), {
    success: "Route deleted",
    onSuccess: () => setToDelete(null),
  });

  const rows = q.data?.results ?? [];
  const activeFilters = (f.status !== "all" ? 1 : 0) + (f.method !== "all" ? 1 : 0);

  return (
    <EnginePage>
      <RouteForm open={formOpen} onClose={closeForm} route={editing} defaultType={f.tab as Scope} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete route"
        message={`Delete ${toDelete?.label}? Routes that have rules or overrides can't be deleted — deactivate them instead.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={canEdit && <Btn variant="primary" icon={Plus} onClick={() => setF({ new: "1" })}>Add Route</Btn>}
      />
      <Tabs tabs={TABS} active={f.tab as Scope} onChange={(tab) => setF({ tab })} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="size-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input placeholder="Search routes..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search routes" />
        </div>
        <FilterPopover activeCount={activeFilters}>
          <label className="block text-xs font-medium text-gray-500">Status</label>
          <Select value={f.status} onChange={(e) => setF({ status: e.target.value })} aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <label className="block text-xs font-medium text-gray-500">Shipping method</label>
          <Select value={f.method} onChange={(e) => setF({ method: e.target.value })} aria-label="Filter by method">
            <option value="all">All methods</option>
            {methods.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </FilterPopover>
      </div>

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Route", "Methods", "Rules", "Est. Delivery", "Status", "Actions"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.isPending ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className={td}>
                          <div className="h-4 rounded bg-gray-100 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      <ArrowRight className="size-10 mx-auto mb-3 text-gray-200" />
                      <p className="text-sm">{f.search || activeFilters ? "No routes match your filters." : "No routes yet."}</p>
                      {canEdit && !f.search && (
                        <button type="button" onClick={() => setF({ new: "1" })} className="mt-2 text-blue-600 text-sm hover:underline">
                          Add one now
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className={td}>
                        <span className="flex items-center gap-2 font-medium text-gray-900">
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{r.origin_label}</span>
                          <ArrowRight className="size-3.5 text-gray-400" />
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{r.destination_label}</span>
                        </span>
                      </td>
                      <td className={td}>
                        <div className="flex gap-1 flex-wrap">
                          {r.method_names.map((m) => (
                            <span key={m} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className={`${td} text-gray-600 whitespace-nowrap`}>
                        {r.rules_count} {r.rules_count === 1 ? "rule" : "rules"}
                      </td>
                      <td className={`${td} text-gray-600 whitespace-nowrap`}>{r.estimated_delivery}</td>
                      <td className={td}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <Btn variant="ghost" size="sm" onClick={() => setF({ edit: String(r.id) })}>
                              Manage
                            </Btn>
                          )}
                          <RowMenu
                            items={[
                              { label: "View rules", onClick: () => router.push(`/shipping-engine/rules?tab=${r.type}&route=${r.id}`) },
                              { label: r.status === "active" ? "Deactivate" : "Activate", onClick: () => toggle.mutate(r), hidden: !canEdit },
                              { label: "Delete", onClick: () => setToDelete(r), danger: true, hidden: !canManage },
                            ]}
                          />
                        </div>
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
