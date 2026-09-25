"use client";

import { ChevronDown, ChevronUp, ScrollText, User } from "lucide-react";
import React, { useState } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead, Tr, TableSkeletonRows } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import type { AuditAction, AuditLog } from "@/lib/api/types";
import { formatDateTime, titleCase } from "@/lib/format";

export const ACTION_TONES: Record<AuditAction, BadgeTone> = {
  create: "green",
  update: "blue",
  delete: "red",
  status_change: "purple",
  login: "indigo",
  logout: "gray",
  login_failed: "orange",
  password_change: "yellow",
  permission_change: "amber",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function changeSummary(log: AuditLog): string {
  const fields = Object.keys(log.changes ?? {});
  if (fields.length === 0) return "—";
  if (log.action === "create") return `${fields.length} field${fields.length === 1 ? "" : "s"} set`;
  return fields.map(titleCase).join(", ");
}

const COLUMNS = 6;

export function AuditLogTable({ logs, loading }: { logs: AuditLog[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Table>
      <THead>
        <Th>Timestamp</Th>
        <Th>User</Th>
        <Th>Action</Th>
        <Th>Record</Th>
        <Th>Changes</Th>
        <Th>Actions</Th>
      </THead>
      <TBody>
        {loading ? (
          <TableSkeletonRows columns={COLUMNS} />
        ) : logs.length === 0 ? (
          <tr>
            <td colSpan={COLUMNS}>
              <EmptyState bare icon={ScrollText} title="No activity found" description="Try adjusting your filters or search terms" />
            </td>
          </tr>
        ) : (
          logs.map((log) => {
            const open = expanded === log.id;
            const changes = Object.entries(log.changes ?? {});
            return (
              <React.Fragment key={log.id}>
                <Tr>
                  <Td className="whitespace-nowrap">
                    <div className="font-semibold text-gray-900">{formatDateTime(log.created_at)}</div>
                    <div className="text-xs text-gray-500">#{log.id}</div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-gray-400 flex-shrink-0" />
                      <div>
                        <div className="text-gray-900">{log.actor?.full_name ?? "System / anonymous"}</div>
                        {log.actor && <div className="text-xs text-gray-500">{log.actor.email}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={ACTION_TONES[log.action]}>{log.action_display}</Badge>
                  </Td>
                  <Td>
                    <div className="text-gray-900 max-w-xs truncate" title={log.object_repr}>
                      {log.object_repr || "—"}
                    </div>
                    {log.entity && <div className="text-xs text-gray-500">{titleCase(log.entity)}</div>}
                  </Td>
                  <Td className="text-sm text-gray-700 max-w-xs">
                    <span className="line-clamp-2">{changeSummary(log)}</span>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : log.id)}
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                      aria-expanded={open}
                    >
                      {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      {open ? "Less" : "Details"}
                    </button>
                  </Td>
                </Tr>
                {open && (
                  <tr>
                    <td colSpan={COLUMNS} className="px-6 py-4 bg-gray-50">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                          <h4 className="font-semibold text-gray-900 mb-3">Changes</h4>
                          {changes.length === 0 ? (
                            <p className="text-sm text-gray-500">No field changes recorded for this action.</p>
                          ) : (
                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Field</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Before</th>
                                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">After</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {changes.map(([field, [before, after]]) => (
                                    <tr key={field}>
                                      <td className="px-4 py-2 font-medium text-gray-900">{titleCase(field)}</td>
                                      <td className="px-4 py-2 text-gray-500 line-through break-all">{formatValue(before)}</td>
                                      <td className="px-4 py-2 text-gray-900 break-all">{formatValue(after)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        <div className="space-y-4 text-sm">
                          <div>
                            <div className="font-semibold text-gray-700 mb-1">Record ID</div>
                            <p className="text-gray-900 font-mono">{log.object_id || "—"}</p>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-700 mb-1">IP Address</div>
                            <p className="text-gray-900 font-mono">{log.ip_address ?? "—"}</p>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-700 mb-1">Device</div>
                            <p className="text-gray-600 break-words">{log.user_agent || "—"}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })
        )}
      </TBody>
    </Table>
  );
}
