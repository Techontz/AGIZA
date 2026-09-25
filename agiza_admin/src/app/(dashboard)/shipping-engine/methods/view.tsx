"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bike, Box, Bus, Edit, Info, Plane, Plus, Search, Ship, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useEngineAccess, useEngineMutation } from "@/components/shipping-engine/hooks";
import { MethodForm } from "@/components/shipping-engine/method-form";
import { Btn, ConfirmDialog, PageHeader, StatCard, StatusBadge } from "@/components/shipping-engine/ui";
import { ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/cn";
import { engine, seKeys, type ShippingMethod } from "@/lib/api/services/shipping-engine";
import { pageMeta } from "@/lib/nav";

const CATEGORY_COLORS: Record<string, string> = {
  air: "bg-sky-100 text-sky-700",
  sea: "bg-blue-100 text-blue-700",
  land: "bg-amber-100 text-amber-700",
  local: "bg-green-100 text-green-700",
};
const CATEGORIES = [
  { id: "air", label: "Air", icon: Plane, color: "blue" },
  { id: "sea", label: "Sea", icon: Ship, color: "blue" },
  { id: "land", label: "Land", icon: Bus, color: "yellow" },
  { id: "local", label: "Local", icon: Bike, color: "green" },
] as const;
const th = "text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap";

export function MethodsView() {
  const meta = pageMeta["/shipping-engine/methods"];
  const { canEdit, canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({ category: "all", search: "", new: "", edit: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const query = { category: f.category, search: f.search, page_size: 100 };
  const q = useQuery({
    queryKey: seKeys.list("methods", query),
    queryFn: ({ signal }) => engine.methods.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: seKeys.list("methods", { stats: true }), queryFn: engine.methods.stats });
  const rows = q.data?.results ?? [];
  const editing = f.edit ? rows.find((m) => String(m.id) === f.edit) ?? null : null;
  const [toDelete, setToDelete] = useState<ShippingMethod | null>(null);

  const toggle = useEngineMutation(
    (m: ShippingMethod) => engine.methods.update(m.id, { status: m.status === "active" ? "inactive" : "active" }),
    { success: (m) => `${(m as ShippingMethod).name} ${(m as ShippingMethod).status === "active" ? "activated" : "deactivated"}` },
  );
  const remove = useEngineMutation((m: ShippingMethod) => engine.methods.remove(m.id), {
    success: "Shipping method deleted",
    onSuccess: () => setToDelete(null),
  });
  const openNew = () => setF({ new: "1" });

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <MethodForm open={f.new === "1" || Boolean(editing)} onClose={() => setF({ new: "", edit: "" })} method={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete shipping method"
        message={`Delete ${toDelete?.name}? Methods used by routes or rules can't be deleted — deactivate them instead.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={canEdit && <Btn variant="primary" icon={Plus} onClick={openNew}>Add Method</Btn>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {CATEGORIES.map((c) => (
          <StatCard key={c.id} label={`${c.label} Methods`} value={stats.data?.[c.id]} icon={c.icon} color={c.color} loading={!stats.data} />
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search methods..."
            aria-label="Search methods"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[{ id: "all", label: "All" }, ...CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setF({ category: c.id })}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                f.category === c.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-gray-500">
          {q.data ? `${q.data.count} method${q.data.count !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={cn(th, "px-5")}>Method</th>
                  <th className={th}>Category</th>
                  <th className={th}>Carriers</th>
                  <th className={th}>Delivery Time</th>
                  <th className={th}>Max Weight</th>
                  <th className={th}>Special</th>
                  <th className={th}>Status</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {q.isPending
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-4">
                            <div className="h-4 rounded bg-gray-100 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{m.name}</span>
                            <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded font-mono">{m.code}</span>
                          </div>
                          {m.description && <p className="text-xs text-gray-400 mt-0.5 max-w-xs">{m.description}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn("text-xs font-medium px-2 py-1 rounded-full", CATEGORY_COLORS[m.category])}>{m.category_display}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {m.carrier_names.length > 0 ? (
                              m.carrier_names.map((c) => (
                                <span key={c} className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded">
                                  {c}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-400 text-xs italic">None assigned</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-700 whitespace-nowrap">{m.estimated_delivery || "TBD"}</td>
                        <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                          {m.max_weight_kg !== null ? `${Number(m.max_weight_kg)} KG` : <span className="text-gray-400">Unlimited</span>}
                        </td>
                        <td className="px-4 py-4">
                          {m.requires_special_handling ? (
                            <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">Yes</span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={m.status} />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setF({ edit: String(m.id) })}
                                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                  aria-label={`Edit ${m.name}`}
                                >
                                  <Edit className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggle.mutate(m)}
                                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
                                >
                                  {m.status === "active" ? "Deactivate" : "Activate"}
                                </button>
                              </>
                            )}
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => setToDelete(m)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                aria-label={`Delete ${m.name}`}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                {q.data && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                      <Box className="size-10 mx-auto mb-3 text-gray-200" />
                      <p className="text-sm">No shipping methods found.</p>
                      {canEdit && (
                        <button type="button" onClick={openNew} className="mt-2 text-blue-600 text-sm hover:underline">
                          Add one now
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <Info className="size-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          Shipping Methods defined here are referenced in <strong>Routes</strong>, <strong>Zones</strong>, and <strong>Rules</strong>.
          Deactivating a method will hide it from new rule assignments but will not affect existing active routes.
        </p>
      </div>
    </div>
  );
}
