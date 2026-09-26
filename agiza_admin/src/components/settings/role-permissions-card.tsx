"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import {
  ACCESS_LABELS,
  ACCESS_LEVELS,
  ACCESS_RANK,
  MATRIX_LEVELS,
  MODULE_LABELS,
  MODULE_ORDER,
  STAFF_LEVEL_LABELS,
  settingsApi,
  settingsKeys,
  type RolePermission,
} from "@/lib/api/services/settings";
import type { Access } from "@/lib/api/types";
import { cn } from "@/lib/cn";

const ACCESS_STYLE: Record<Access, string> = {
  none: "bg-gray-100 text-gray-600 border-gray-200",
  view: "bg-blue-50 text-blue-800 border-blue-200",
  edit: "bg-purple-50 text-purple-800 border-purple-200",
  manage: "bg-green-50 text-green-800 border-green-200",
};

interface PendingChange {
  row: RolePermission;
  access: Access;
}

/** Staff level × module access matrix (role-permissions). Only a Top Admin may edit. */
export function RolePermissionsCard({ editable }: { editable: boolean }) {
  const perms = useQuery({ queryKey: settingsKeys.rolePermissions, queryFn: settingsApi.rolePermissions.list });
  const [confirm, setConfirm] = useState<PendingChange | null>(null);

  const save = useApiMutation(({ row, access }: PendingChange) => settingsApi.rolePermissions.update(row.id, access), {
    invalidate: [settingsKeys.rolePermissions],
    success: (r) =>
      `${r.staff_level_display} · ${r.module_display}: ${ACCESS_LABELS[r.access]}`,
    onSuccess: () => setConfirm(null),
  });

  const { levels, modules, cell } = useMemo(() => {
    const rows = perms.data ?? [];
    const byKey = new Map(rows.map((r) => [`${r.staff_level}:${r.module}`, r]));
    const levelSet = new Set(rows.map((r) => r.staff_level));
    const moduleSet = new Set(rows.map((r) => r.module));
    return {
      levels: [...MATRIX_LEVELS.filter((l) => levelSet.has(l)), ...[...levelSet].filter((l) => !MATRIX_LEVELS.includes(l))],
      modules: [...MODULE_ORDER.filter((m) => moduleSet.has(m)), ...[...moduleSet].filter((m) => !MODULE_ORDER.includes(m))],
      cell: (level: string, module: string) => byKey.get(`${level}:${module}`),
    };
  }, [perms.data]);

  const levelLabel = (l: RolePermission["staff_level"]) =>
    perms.data?.find((r) => r.staff_level === l)?.staff_level_display ?? STAFF_LEVEL_LABELS[l];
  const moduleLabel = (m: RolePermission["module"]) =>
    perms.data?.find((r) => r.module === m)?.module_display ?? MODULE_LABELS[m];

  const change = (row: RolePermission, access: Access) => {
    if (access === row.access) return;
    if (ACCESS_RANK[access] < ACCESS_RANK[row.access]) setConfirm({ row, access });
    else save.mutate({ row, access });
  };

  return (
    <Card className="p-6 mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <ShieldCheck className="size-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Role Permissions</h2>
            <p className="text-sm text-gray-600">What each staff level can do in every module</p>
          </div>
        </div>
        {!editable && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 w-fit">
            <Lock className="size-3.5" /> Read-only — only a Top Admin can change permissions
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4 text-xs text-gray-600">
        <span>
          <span className="font-semibold text-gray-700">View</span> — see records
        </span>
        <span>
          <span className="font-semibold text-gray-700">Edit</span> — create and update
        </span>
        <span>
          <span className="font-semibold text-gray-700">Manage</span> — also delete, approve and configure
        </span>
        <span>
          <span className="font-semibold text-gray-700">Top Admin</span> always has full access
        </span>
      </div>

      {perms.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading permissions">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : perms.isError ? (
        <ErrorState bare message={errorText(perms.error)} onRetry={() => perms.refetch()} />
      ) : levels.length === 0 ? (
        <EmptyState bare icon={ShieldCheck} title="No permission rows" description="Run the backend seed to create the default matrix." />
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">Access by staff level and module</caption>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-[1] bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider"
                >
                  Module
                </th>
                {levels.map((l) => (
                  <th
                    key={l}
                    scope="col"
                    className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap"
                  >
                    {levelLabel(l)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {modules.map((m) => (
                <tr key={m} className="hover:bg-gray-50">
                  <th scope="row" className="sticky left-0 z-[1] bg-white px-4 py-2.5 text-left font-medium text-gray-900 whitespace-nowrap">
                    {moduleLabel(m)}
                  </th>
                  {levels.map((l) => {
                    const row = cell(l, m);
                    if (!row) return <td key={l} className="px-3 py-2.5 text-gray-400">—</td>;
                    const pending = save.isPending && save.variables?.row.id === row.id;
                    return (
                      <td key={l} className="px-3 py-2.5">
                        {editable ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              aria-label={`${levelLabel(l)} access to ${moduleLabel(m)}`}
                              value={row.access}
                              disabled={pending}
                              onChange={(e) => change(row, e.target.value as Access)}
                              className={cn(
                                "rounded-md border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60",
                                ACCESS_STYLE[row.access],
                              )}
                            >
                              {ACCESS_LEVELS.map((a) => (
                                <option key={a} value={a}>
                                  {ACCESS_LABELS[a]}
                                </option>
                              ))}
                            </select>
                            {pending && <Loader2 className="size-3.5 animate-spin text-gray-400" aria-label="Saving" />}
                          </div>
                        ) : (
                          <span className={cn("inline-block rounded-md border px-2 py-1 text-xs font-medium", ACCESS_STYLE[row.access])}>
                            {ACCESS_LABELS[row.access]}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.access === "none" ? "Remove access" : "Reduce access"}
        tone="danger"
        confirmLabel={confirm?.access === "none" ? "Remove access" : "Reduce access"}
        pending={save.isPending}
        onConfirm={() => confirm && save.mutate(confirm)}
        onClose={() => !save.isPending && setConfirm(null)}
        message={
          confirm && (
            <>
              Change <span className="font-semibold">{levelLabel(confirm.row.staff_level)}</span> access to{" "}
              <span className="font-semibold">{moduleLabel(confirm.row.module)}</span> from{" "}
              <span className="font-semibold">{ACCESS_LABELS[confirm.row.access]}</span> to{" "}
              <span className="font-semibold">{ACCESS_LABELS[confirm.access]}</span>? Everyone at this level is affected
              immediately.
            </>
          )
        }
      />
    </Card>
  );
}
