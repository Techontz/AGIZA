"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckSquare, Clock, Plus, User } from "lucide-react";
import { useEffect, useState } from "react";

import { SlaTimer, TaskDepartmentBadge, TaskStatusBadge, TaskTypeBadge, linkedKindLabel, useNow } from "@/components/tasks/badges";
import { TaskDetailPanel } from "@/components/tasks/detail-panel";
import { NewTaskModal } from "@/components/tasks/new-task-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import { taskKeys, tasksApi, type TaskView } from "@/lib/api/services/tasks";
import { pageMeta } from "@/lib/nav";

const COLUMNS = ["Task ID", "Task Type", "Linked Item", "Status", "Department", "Owner", "SLA Timer", "Action"];

export function TasksView() {
  const meta = pageMeta["/tasks"];
  const { data: me } = useMe();
  const canEdit = can(me, "tasks", "edit");
  const now = useNow();
  const [f, setF] = useUrlFilters({ view: "mine", search: "", page: "1", open: "" });
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);
  const [creating, setCreating] = useState(false);

  const query = { view: f.view, search: f.search, page: Number(f.page), page_size: 20 };
  const list = useQuery({ queryKey: taskKeys.list(query), queryFn: ({ signal }) => tasksApi.list(query, signal), placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: taskKeys.stats, queryFn: tasksApi.stats });
  const openId = f.open ? Number(f.open) : null;
  const openTask = useQuery({ queryKey: taskKeys.one(openId ?? 0), queryFn: () => tasksApi.get(openId!), enabled: Boolean(openId) });
  const rows = list.data?.results ?? [];
  const s = stats.data;
  const n = (v: number | undefined) => v ?? "…";

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New Task
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Assigned to Me" value={s?.mine} icon={CheckSquare} tone="blue" loading={!s} />
        <StatCard label="Unassigned" value={s?.unassigned} icon={User} tone="orange" loading={!s} />
        <StatCard label="Overdue" value={s?.overdue} icon={AlertTriangle} tone="red" loading={!s} />
        <StatCard label="Due Today" value={s?.due_today} icon={Clock} tone="yellow" loading={!s} />
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <SearchInput placeholder="Search by Task ID, Order ID, or Description..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search tasks" />
          <div className="text-sm">
            <PillTabs<TaskView>
              value={f.view as TaskView}
              onChange={(view) => setF({ view })}
              options={[
                { value: "mine", label: `Assigned to Me (${n(s?.mine)})` },
                { value: "unassigned", label: `Unassigned (${n(s?.unassigned)})`, activeClass: "bg-orange-600" },
                { value: "overdue", label: `Overdue (${n(s?.overdue)})`, activeClass: "bg-red-600" },
                { value: "due_today", label: `Due Today (${n(s?.due_today)})`, activeClass: "bg-yellow-600" },
                { value: "all", label: "All Tasks" },
              ]}
            />
          </div>
        </div>
      </Card>

      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState icon={CheckSquare} title="No tasks found" description="Try adjusting your filters" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>{COLUMNS.map((h) => <Th key={h}>{h}</Th>)}</THead>
            <TBody>
              {list.isPending ? (
                <TableSkeletonRows columns={COLUMNS.length} />
              ) : (
                rows.map((t) => (
                  <Tr key={t.id} className={cn(t.is_overdue ? "bg-red-50" : !t.owner && t.is_open ? "bg-orange-50" : "")}>
                    <Td>
                      <div className="font-semibold text-gray-900 whitespace-nowrap">{t.reference}</div>
                      {t.priority === "high" && (
                        <div className="flex items-center gap-1 text-red-600 text-xs mt-1 whitespace-nowrap">
                          <AlertTriangle className="size-3" />
                          <span>High Priority</span>
                        </div>
                      )}
                    </Td>
                    <Td><TaskTypeBadge type={t.task_type} label={t.task_type_display} /></Td>
                    <Td>
                      {t.linked_item ? (
                        <>
                          <div className="font-medium text-blue-600 whitespace-nowrap">{t.linked_item.reference}</div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">{linkedKindLabel(t.linked_item.kind)}</div>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </Td>
                    <Td><TaskStatusBadge status={t.status} label={t.status_display} /></Td>
                    <Td><TaskDepartmentBadge department={t.department} label={t.department_display} /></Td>
                    <Td>
                      {t.owner ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="size-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-900 font-medium whitespace-nowrap">{t.owner.full_name}</span>
                          </div>
                          {t.owner.role && <div className="text-xs text-gray-500 ml-6">{t.owner.role}</div>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-orange-600 font-medium whitespace-nowrap">
                          <AlertTriangle className="size-4" />
                          <span>Unassigned</span>
                        </div>
                      )}
                    </Td>
                    <Td><SlaTimer task={t} now={now} /></Td>
                    <Td>
                      <button type="button" onClick={() => setF({ open: String(t.id), page: f.page })} className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors">
                        View
                      </button>
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
          {list.data && list.data.total_pages > 1 && (
            <Pagination page={list.data.page} pageSize={list.data.page_size} count={list.data.count} totalPages={list.data.total_pages} onPageChange={(p) => setF({ page: String(p) })} disabled={list.isFetching} />
          )}
        </Card>
      )}

      {openId && openTask.isError && (
        <div className="fixed bottom-4 right-4 z-40">
          <Card className="p-4 flex items-center gap-3">
            <span className="text-sm text-red-600">{errorText(openTask.error)}</span>
            <Button size="sm" variant="muted" onClick={() => setF({ open: "", page: f.page })}>Dismiss</Button>
          </Card>
        </div>
      )}
      {openId && openTask.data && <TaskDetailPanel task={openTask.data} onClose={() => setF({ open: "", page: f.page })} />}
      <NewTaskModal open={creating} onClose={() => setCreating(false)} onCreated={(t) => setF({ open: String(t.id), page: f.page })} />
    </PageContainer>
  );
}
