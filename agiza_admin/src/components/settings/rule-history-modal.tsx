"use client";

import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { errorText } from "@/lib/api/errors";
import { RULE_TRIGGERS, settingsApi, settingsKeys, type TagRule } from "@/lib/api/services/settings";
import { formatDateTime, timeAgo, titleCase } from "@/lib/format";

const TRIGGER_TONE: Record<string, BadgeTone> = { save: "blue", manual: "purple", scheduled: "gray", activity: "teal" };

/** Audit history of a rule's evaluations (last 50 runs). */
export function RuleHistoryModal({ rule, onClose }: { rule: TagRule; onClose: () => void }) {
  const runs = useQuery({ queryKey: settingsKeys.ruleRuns(rule.id), queryFn: () => settingsApi.tagRules.runs(rule.id) });

  return (
    <Modal open onClose={onClose} size="3xl" title={<span className="text-xl">Run history · {rule.name}</span>}>
      <p className="text-sm text-gray-600 mb-4">
        Each time the rule runs it re-checks every customer: matching customers get the tag{" "}
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">{rule.tag}</span>, customers
        who no longer match lose it.
      </p>
      {runs.isError ? (
        <ErrorState bare message={errorText(runs.error)} onRetry={() => runs.refetch()} />
      ) : runs.data?.length === 0 ? (
        <EmptyState bare icon={History} title="No runs yet" description="The rule runs when it is saved, toggled or run manually." />
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <Table>
            <THead>
              <Th>When</Th>
              <Th>Trigger</Th>
              <Th className="text-right">Matched</Th>
              <Th className="text-right">Added</Th>
              <Th className="text-right">Removed</Th>
              <Th>Run by</Th>
            </THead>
            <TBody>
              {runs.isLoading ? (
                <TableSkeletonRows rows={4} columns={6} />
              ) : (
                runs.data?.map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap">
                      <p className="text-sm text-gray-900">{timeAgo(r.created_at)}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(r.created_at)}</p>
                    </Td>
                    <Td>
                      <Badge square tone={TRIGGER_TONE[r.trigger] ?? "gray"}>
                        {RULE_TRIGGERS[r.trigger] ?? titleCase(r.trigger)}
                      </Badge>
                    </Td>
                    <Td className="text-right text-sm font-semibold text-gray-900">{r.matched.toLocaleString()}</Td>
                    <Td className="text-right text-sm font-medium text-green-700">+{r.added.toLocaleString()}</Td>
                    <Td className="text-right text-sm font-medium text-red-700">−{r.removed.toLocaleString()}</Td>
                    <Td className="text-sm text-gray-700 whitespace-nowrap">{r.run_by?.full_name ?? "System"}</Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
