import { History } from "lucide-react";

import type { CustomerProfile } from "@/lib/api/services/crm";
import { formatDateTime, timeAgo, titleCase } from "@/lib/format";

import { TabEmpty } from "./shared";

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Audit entries recorded as {field: [old, new]} (other shapes are shown as-is). */
function describeChanges(changes: Record<string, unknown> | null): string[] {
  if (!changes) return [];
  return Object.entries(changes).map(([field, value]) => {
    const name = titleCase(field);
    if (Array.isArray(value) && value.length === 2) {
      const [from, to] = value as [unknown, unknown];
      if (from === null || from === undefined || from === "") return `${name}: ${show(to)}`;
      return `${name}: ${show(from)} → ${show(to)}`;
    }
    return `${name}: ${show(value)}`;
  });
}

/** Who did what, when — changes to the customer and their orders (latest 30). */
export function ActivityTab({ profile }: { profile: CustomerProfile }) {
  const { activity, customer } = profile;
  return (
    <div className="p-4 sm:p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Activity — {customer.full_name}</h3>
      {activity.length === 0 ? (
        <TabEmpty icon={History} text="No activity recorded yet" />
      ) : (
        <ol className="relative border-l border-gray-200 ml-2 space-y-4">
          {activity.map((a, i) => {
            const lines = describeChanges(a.changes);
            return (
              <li key={`${a.at}-${i}`} className="ml-4">
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-blue-500" />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm text-gray-900">
                    <span className="font-semibold">{a.by}</span> <span className="text-gray-600">{a.action.toLowerCase()}</span>{" "}
                    <span className="font-medium">{a.object}</span>
                  </p>
                  <time dateTime={a.at} title={formatDateTime(a.at)} className="text-xs text-gray-400 whitespace-nowrap">
                    {timeAgo(a.at)}
                  </time>
                </div>
                {lines.length > 0 && (
                  <ul className="mt-1.5 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                    {lines.map((line) => (
                      <li key={line} className="text-xs text-gray-600 break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
