"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BarChart3, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";

import { AuditLogTable } from "@/components/audit/audit-log-table";
import { ReportsDashboardTab } from "@/components/reports/reports-dashboard";
import { Card } from "@/components/ui/card";
import { Input, SearchInput, Select } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { queryKeys } from "@/lib/api/query-keys";
import { auditEntitiesService, auditService } from "@/lib/api/services/audit";
import { pageMeta } from "@/lib/nav";

const ACTIONS = [
  ["create", "Created"],
  ["update", "Updated"],
  ["delete", "Deleted"],
  ["status_change", "Status changed"],
  ["login", "Logged in"],
  ["logout", "Logged out"],
  ["login_failed", "Failed login"],
  ["password_change", "Password changed"],
  ["permission_change", "Permission changed"],
] as const;

const PAGE_SIZE = 20;

type Tab = "dashboard" | "audit";

/** Reporting page: the Dashboard (default) and the Audit Trail. */
export function AuditLogsView() {
  const meta = pageMeta["/audit-logs"];
  const [f, setF] = useUrlFilters({ tab: "dashboard" });
  const tab: Tab = f.tab === "audit" ? "audit" : "dashboard";

  return (
    <PageContainer>
      <PageHeader title={meta.title} description={meta.description} />
      <UnderlineTabs<Tab>
        className="mb-6"
        value={tab}
        onChange={(t) => setF({ tab: t })}
        options={[
          { value: "dashboard", label: <><BarChart3 className="size-4" />Dashboard</> },
          { value: "audit", label: <><ScrollText className="size-4" />Audit Trail</> },
        ]}
      />
      {tab === "dashboard" ? <ReportsDashboardTab /> : <AuditTrailTab />}
    </PageContainer>
  );
}

function AuditTrailTab() {
  const [filters, setFilters] = useUrlFilters({
    search: "",
    action: "all",
    entity: "all",
    date_from: "",
    date_to: "",
    page: "1",
  });

  // Search input updates immediately; the URL/query follow after a short debounce.
  const [search, setSearch] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(search);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
  }, [debouncedSearch, filters.search, setFilters]);

  const query = {
    page: Number(filters.page) || 1,
    page_size: PAGE_SIZE,
    search: filters.search,
    action: filters.action,
    entity: filters.entity,
    date_from: filters.date_from,
    date_to: filters.date_to,
  };

  const logs = useQuery({
    queryKey: queryKeys.auditLogs(query),
    queryFn: ({ signal }) => auditService.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const entities = useQuery({ queryKey: ["audit-log-entities"], queryFn: auditEntitiesService.list, staleTime: 5 * 60_000 });

  return (
    <>
      {/* Controls */}
      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <SearchInput
            placeholder="Search record or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search audit logs"
          />
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <Select
              aria-label="Filter by action"
              value={filters.action}
              onChange={(e) => setFilters({ action: e.target.value })}
              className="sm:w-48"
            >
              <option value="all">All Actions</option>
              {ACTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by record type"
              value={filters.entity}
              onChange={(e) => setFilters({ entity: e.target.value })}
              className="sm:w-48"
            >
              <option value="all">All Record Types</option>
              {entities.data?.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="From date"
                value={filters.date_from}
                max={filters.date_to || undefined}
                onChange={(e) => setFilters({ date_from: e.target.value })}
                className="sm:w-40"
              />
              <span className="text-gray-400">–</span>
              <Input
                type="date"
                aria-label="To date"
                value={filters.date_to}
                min={filters.date_from || undefined}
                onChange={(e) => setFilters({ date_to: e.target.value })}
                className="sm:w-40"
              />
            </div>
          </div>
        </div>
      </Card>

      {logs.isError && !logs.data ? (
        <ErrorState message={(logs.error as Error).message} onRetry={() => logs.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <AuditLogTable logs={logs.data?.results ?? []} loading={logs.isPending} />
          {logs.data && (
            <Pagination
              page={logs.data.page}
              pageSize={logs.data.page_size}
              count={logs.data.count}
              totalPages={logs.data.total_pages}
              disabled={logs.isFetching}
              onPageChange={(page) => setFilters({ page: String(page) })}
            />
          )}
        </Card>
      )}
    </>
  );
}
