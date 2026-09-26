"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Play, Plus, RefreshCw, Tag as TagIcon, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import { settingsApi, settingsKeys, type RuleCondition, type TagRule } from "@/lib/api/services/settings";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

import { RuleEditorModal } from "./rule-editor-modal";
import { RuleHistoryModal } from "./rule-history-modal";

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function conditionValue(c: RuleCondition) {
  if (c.field === "category") return c.value;
  const n = Number(c.value);
  return Number.isFinite(n) ? n.toLocaleString() : c.value;
}

function RuleEffect({ rule }: { rule: TagRule }) {
  const run = rule.last_run;
  return (
    <p className="mt-3 text-xs text-gray-500">
      {rule.enabled ? (
        <>
          Matches <span className="font-semibold text-gray-700">{plural(rule.last_matched, "customer")}</span>
        </>
      ) : (
        <>Disabled — tags are not assigned</>
      )}
      {" · "}
      <span className="font-medium text-gray-700">{rule.tagged_customers.toLocaleString()}</span> tagged
      {" · "}
      {run ? (
        <>
          last run {timeAgo(run.created_at)}:{" "}
          <span className="font-medium text-green-700">+{run.added.toLocaleString()}</span> /{" "}
          <span className="font-medium text-red-700">−{run.removed.toLocaleString()}</span>
        </>
      ) : (
        "not run yet"
      )}
    </p>
  );
}

function RulesSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading tag rules">
      {[0, 1, 2].map((i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-4">
          <Skeleton className="h-5 w-48 mb-3" />
          <Skeleton className="h-4 w-72 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

/** "Tag Rules Engine" card from the Settings design, backed by crm/tag-rules. */
export function TagRulesCard({ canManage }: { canManage: boolean }) {
  const rules = useQuery({ queryKey: settingsKeys.tagRules, queryFn: ({ signal }) => settingsApi.tagRules.list(signal) });
  const [editing, setEditing] = useState<TagRule | "new" | null>(null);
  const [history, setHistory] = useState<TagRule | null>(null);
  const [deleting, setDeleting] = useState<TagRule | null>(null);

  const invalidate = [settingsKeys.tagRules];
  const toggle = useApiMutation((r: TagRule) => settingsApi.tagRules.toggle(r.id), {
    invalidate,
    success: (r) => (r.enabled ? `“${r.name}” enabled — matches ${plural(r.last_matched, "customer")}` : `“${r.name}” disabled`),
  });
  const runOne = useApiMutation((r: TagRule) => settingsApi.tagRules.run(r.id), {
    invalidate,
    success: (r) =>
      `“${r.name}” ran: ${plural(r.last_matched, "match")}` +
      (r.last_run ? ` (+${r.last_run.added} / −${r.last_run.removed})` : ""),
  });
  const runAll = useApiMutation(() => settingsApi.tagRules.runAll(), {
    invalidate,
    success: (r) => `Ran ${plural(r.rules, "rule")}: +${r.added.toLocaleString()} tags added, −${r.removed.toLocaleString()} removed`,
  });
  const remove = useApiMutation((r: TagRule) => settingsApi.tagRules.remove(r.id), {
    invalidate,
    success: "Rule deleted and its tags removed",
    onSuccess: () => setDeleting(null),
  });

  const list = rules.data ?? [];
  const busy = (m: { isPending: boolean; variables?: TagRule }, r: TagRule) => m.isPending && m.variables?.id === r.id;

  return (
    <Card className="p-6 mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-purple-100 p-2 rounded-lg">
            <TagIcon className="size-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Tag Rules Engine</h2>
            <p className="text-sm text-gray-600">Automatically assign tags based on user behavior</p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              loading={runAll.isPending}
              disabled={list.filter((r) => r.enabled).length === 0}
              onClick={() => runAll.mutate(undefined)}
              title="Re-evaluate every enabled rule against all customers"
            >
              {!runAll.isPending && <RefreshCw className="size-4" />}
              Run all rules now
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-5" />
              Add Rule
            </Button>
          </div>
        )}
      </div>

      {rules.isLoading ? (
        <RulesSkeleton />
      ) : rules.isError ? (
        <ErrorState bare message={errorText(rules.error)} onRetry={() => rules.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          bare
          icon={TagIcon}
          title="No tag rules yet"
          description="Rules tag customers automatically, e.g. “Total Spent greater than 1,000,000 → VIP”."
          action={
            canManage && (
              <Button onClick={() => setEditing("new")}>
                <Plus className="size-5" /> Add Rule
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-4">
          {list.map((rule) => (
            <li
              key={rule.id}
              className={cn("border rounded-lg p-4", rule.enabled ? "border-gray-300 bg-white" : "border-gray-200 bg-gray-50")}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="font-bold text-gray-900">{rule.name}</h3>
                    <span
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
                        rule.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {rule.conditions.map((c, index) => (
                      <div key={c.id} className="text-sm text-gray-600">
                        {index > 0 && <span className="font-semibold text-gray-700">AND </span>}
                        <span className="font-medium">{c.field_display}</span>{" "}
                        <span className="text-gray-500">{c.operator_display}</span>{" "}
                        <span className="font-semibold text-gray-900">{conditionValue(c)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <span className="text-sm text-gray-600">→ Assigns tag: </span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">{rule.tag}</span>
                  </div>
                  <RuleEffect rule={rule} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setEditing(rule)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors font-medium"
                    >
                      Edit
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => toggle.mutate(rule)}
                      disabled={busy(toggle, rule)}
                      className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors font-medium inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      {busy(toggle, rule) && <Loader2 className="size-3.5 animate-spin" />}
                      {rule.enabled ? "Disable" : "Enable"}
                    </button>
                  )}
                  {canManage && rule.enabled && (
                    <button
                      type="button"
                      onClick={() => runOne.mutate(rule)}
                      disabled={busy(runOne, rule) || runAll.isPending}
                      className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-60"
                      aria-label={`Run “${rule.name}” now`}
                      title="Run now"
                    >
                      {busy(runOne, rule) ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setHistory(rule)}
                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    aria-label={`Run history of “${rule.name}”`}
                    title="Run history"
                  >
                    <History className="size-4" />
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setDeleting(rule)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      aria-label={`Delete “${rule.name}”`}
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <RuleEditorModal rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {history && <RuleHistoryModal rule={history} onClose={() => setHistory(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete tag rule"
        tone="danger"
        confirmLabel="Delete rule"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => !remove.isPending && setDeleting(null)}
        message={
          deleting && (
            <>
              Delete <span className="font-semibold">{deleting.name}</span>? The tag{" "}
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{deleting.tag}</span> will be
              removed from the {plural(deleting.tagged_customers, "customer")} this rule assigned it to. Tags added by hand are
              kept.
            </>
          )
        }
      />
    </Card>
  );
}
