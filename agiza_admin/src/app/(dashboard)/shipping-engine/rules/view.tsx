"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlignJustify, ArrowRight, ChevronRight, Edit, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { FilterPopover } from "@/components/shipping-engine/filter-popover";
import { useEngineAccess, useEngineMutation, useRouteOptions } from "@/components/shipping-engine/hooks";
import { RuleForm } from "@/components/shipping-engine/rule-form";
import {
  Btn,
  ConfirmDialog,
  EnginePage,
  IconButton,
  Input,
  PageHeader,
  RowMenu,
  SectionCard,
  Select,
  StatusBadge,
  Tabs,
} from "@/components/shipping-engine/ui";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/cn";
import { engine, PRICING_OPTIONS, seKeys, type Scope, type ShippingRule } from "@/lib/api/services/shipping-engine";
import { pageMeta } from "@/lib/nav";

const TABS: { id: Scope; label: string }[] = [
  { id: "local", label: "Local Delivery Rules" },
  { id: "international", label: "International Shipping Rules" },
];
const HEAD = ["ID", "Route", "Applies To", "Profile/Category", "Method", "Pricing", "Rate", "Min Charge", "Delivery", "Carrier", "Status", ""];
const cell = "px-3 py-3";

export function RulesView() {
  const meta = pageMeta["/shipping-engine/rules"];
  const { canEdit, canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({
    tab: "local", search: "", status: "all", pricing_model: "all", route: "", page: "1", new: "", edit: "",
  });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const query = {
    type: f.tab, search: f.search, status: f.status, pricing_model: f.pricing_model, route: f.route,
    page: Number(f.page), page_size: 50, ordering: "code",
  };
  const q = useQuery({
    queryKey: seKeys.list("rules", query),
    queryFn: ({ signal }) => engine.rules.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const routes = useRouteOptions();
  const filterRoute = f.route ? routes.data?.find((r) => String(r.id) === f.route) : undefined;

  // The rule being edited may not be on the current page (e.g. opened from the Overview).
  const inPage = f.edit ? q.data?.results.find((r) => String(r.id) === f.edit) : undefined;
  const single = useQuery({
    queryKey: ["se", "rules", "one", f.edit],
    queryFn: () => engine.rules.get(Number(f.edit)),
    enabled: Boolean(f.edit) && !inPage && Boolean(q.data),
  });
  const editing = inPage ?? single.data ?? null;

  const [toDelete, setToDelete] = useState<ShippingRule | null>(null);
  const toggle = useEngineMutation(
    (r: ShippingRule) => engine.rules.update(r.id, { status: r.status === "active" ? "inactive" : "active" }),
    { success: (r) => `Rule ${(r as ShippingRule).code} ${(r as ShippingRule).status === "active" ? "activated" : "deactivated"}` },
  );
  const remove = useEngineMutation((r: ShippingRule) => engine.rules.remove(r.id), {
    success: "Rule deleted",
    onSuccess: () => setToDelete(null),
  });

  const rows = q.data?.results ?? [];
  const activeFilters = (f.status !== "all" ? 1 : 0) + (f.pricing_model !== "all" ? 1 : 0);

  return (
    <EnginePage>
      <RuleForm
        open={f.new === "1" || Boolean(editing)}
        onClose={() => setF({ new: "", edit: "" })}
        rule={editing}
        type={(editing?.route_type ?? f.tab) as Scope}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete rule"
        message={`Delete ${toDelete?.code}? This cannot be undone. To keep its history, deactivate it instead.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={canEdit && <Btn variant="primary" icon={Plus} onClick={() => setF({ new: "1" })}>Create Rule</Btn>}
      />

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Rule Priority — system automatically picks the most specific rule
        </p>
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {["1 — Specific Product", "2 — Shipping Profile", "3 — General Route"].map((item, i) => (
            <span key={item} className="flex items-center gap-1">
              <span className={cn("px-2 py-0.5 rounded font-medium", i === 0 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700")}>{item}</span>
              {i < 2 && <ChevronRight className="size-3 text-gray-400" />}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Special handling (battery, fragile, etc.) is automatically inherited from the product&apos;s Shipping Profile — no need to set it on the rule.
        </p>
      </div>

      <Tabs tabs={TABS} active={f.tab as Scope} onChange={(tab) => setF({ tab, route: "" })} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="size-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input placeholder="Search rules..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search rules" />
        </div>
        <FilterPopover activeCount={activeFilters}>
          <label className="block text-xs font-medium text-gray-500">Status</label>
          <Select value={f.status} onChange={(e) => setF({ status: e.target.value })} aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
          <label className="block text-xs font-medium text-gray-500">Pricing model</label>
          <Select value={f.pricing_model} onChange={(e) => setF({ pricing_model: e.target.value })} aria-label="Filter by pricing model">
            <option value="all">All pricing models</option>
            {PRICING_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </FilterPopover>
        {filterRoute && (
          <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-medium">
            Route: {filterRoute.label}
            <button type="button" onClick={() => setF({ route: "" })} aria-label="Clear route filter">
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {HEAD.map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "text-left text-xs font-medium text-gray-500 px-3 py-3 whitespace-nowrap",
                        i === HEAD.length - 1 && "sticky right-0 bg-white",
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.isPending ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {HEAD.map((__, j) => (
                        <td key={j} className={cell}>
                          <div className="h-4 rounded bg-gray-100 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={HEAD.length} className="px-4 py-12 text-center text-gray-400">
                      <AlignJustify className="size-10 mx-auto mb-3 text-gray-200" />
                      <p className="text-sm">
                        {f.search || activeFilters || f.route ? "No rules match your filters." : `No ${f.tab === "local" ? "local delivery" : "international shipping"} rules yet.`}
                      </p>
                      {canEdit && (
                        <button type="button" onClick={() => setF({ new: "1" })} className="mt-2 text-blue-600 text-sm hover:underline">
                          Create a rule
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className={`${cell} font-mono text-xs text-gray-400 whitespace-nowrap`}>{r.code}</td>
                      <td className={cell}>
                        <span className="flex items-center gap-1 text-xs whitespace-nowrap">
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded">{r.origin_label}</span>
                          <ArrowRight className="size-3 text-gray-400" />
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded">{r.destination_label}</span>
                        </span>
                      </td>
                      <td className={`${cell} text-gray-600 text-xs whitespace-nowrap`}>{r.applies_to_display}</td>
                      <td className={cell}>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                            r.priority === 1 ? "bg-blue-100 text-blue-700" : r.priority === 2 ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600",
                          )}
                        >
                          {r.target_label}
                        </span>
                      </td>
                      <td className={`${cell} text-gray-600 text-xs whitespace-nowrap`}>{r.method_name}</td>
                      <td className={`${cell} text-gray-600 text-xs whitespace-nowrap`}>
                        {r.pricing_model_display}
                        {r.volumetric_divisor && <span className="text-gray-400"> ÷{r.volumetric_divisor.toLocaleString()}</span>}
                      </td>
                      <td className={`${cell} font-medium text-gray-900 text-xs whitespace-nowrap`}>{r.rate_display}</td>
                      <td className={`${cell} text-gray-500 text-xs whitespace-nowrap`}>{r.minimum_charge_display ?? "—"}</td>
                      <td className={`${cell} text-gray-600 text-xs whitespace-nowrap`}>{r.estimated_delivery}</td>
                      <td className={`${cell} text-gray-500 text-xs whitespace-nowrap`}>{r.carrier_name ?? "Any"}</td>
                      <td className={cell}>
                        <StatusBadge status={r.status} />
                      </td>
                      {/* Actions stay visible while the wide table scrolls horizontally. */}
                      <td className={`${cell} sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]`}>
                        <div className="flex items-center gap-1">
                          {canEdit && <IconButton icon={Edit} size="sm" label={`Edit ${r.code}`} onClick={() => setF({ edit: String(r.id) })} />}
                          <RowMenu
                            size="sm"
                            items={[
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
