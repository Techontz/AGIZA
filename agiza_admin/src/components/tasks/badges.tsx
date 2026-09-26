"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import {
  LINKED_KIND_LABEL,
  TASK_DEPARTMENTS,
  TASK_STATUSES,
  TASK_TYPES,
  type LinkedKind,
  type Task,
  type TaskDepartment,
  type TaskStatus,
  type TaskType,
} from "@/lib/api/services/tasks";

const pill = "px-3 py-1 rounded-full text-xs font-medium inline-block w-fit whitespace-nowrap";

export const TaskTypeBadge = ({ type, label }: { type: TaskType; label?: string }) => {
  const [c, l] = TASK_TYPES[type] ?? ["bg-gray-100 text-gray-800", label ?? type];
  return <span className={cn(pill, c)}>{l}</span>;
};

export const TaskStatusBadge = ({ status, label }: { status: TaskStatus; label?: string }) => {
  const [c, l] = TASK_STATUSES[status] ?? ["bg-gray-100 text-gray-800", label ?? status];
  return <span className={cn(pill, c)}>{l}</span>;
};

export const TaskDepartmentBadge = ({ department, label }: { department: TaskDepartment; label?: string }) => {
  const [c, l] = TASK_DEPARTMENTS[department] ?? ["bg-gray-100 text-gray-800", label ?? department];
  return <span className={cn(pill, c)}>{l}</span>;
};

export const linkedKindLabel = (kind: LinkedKind) => LINKED_KIND_LABEL[kind] ?? kind;

/** Current time, refreshed every 30s so SLA timers stay live. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const HOUR = 3_600_000;

/** Design SLA badge: overdue or < 2h red, < 4h yellow, otherwise green. */
export function SlaTimer({ task, now }: { task: Pick<Task, "sla_deadline" | "is_open" | "status_display">; now: number }) {
  if (!task.is_open) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-full text-gray-600 bg-gray-100 font-medium text-sm w-fit whitespace-nowrap">
        <CheckCircle2 className="size-4" />
        <span>{task.status_display}</span>
      </div>
    );
  }
  const diffMs = new Date(task.sla_deadline).getTime() - now;
  let color = "text-green-600 bg-green-50";
  let icon = <CheckCircle2 className="size-4" />;
  if (diffMs < 2 * HOUR) {
    color = "text-red-600 bg-red-50";
    icon = <AlertTriangle className="size-4" />;
  } else if (diffMs < 4 * HOUR) {
    color = "text-yellow-600 bg-yellow-50";
    icon = <Clock className="size-4" />;
  }

  const abs = Math.abs(diffMs);
  const hours = Math.floor(abs / HOUR);
  const minutes = Math.floor((abs % HOUR) / 60_000);
  let text: string;
  if (diffMs < 0) {
    text = hours >= 24 ? `${Math.floor(hours / 24)}d overdue` : hours > 0 ? `${hours}h overdue` : `${minutes}m overdue`;
  } else if (hours >= 24) {
    text = `${Math.floor(hours / 24)}d ${hours % 24}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m`;
  } else {
    text = `${minutes}m`;
  }

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full font-medium text-sm w-fit whitespace-nowrap", color)}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

/** Admin route for a task's linked order or quote (null when there's no screen for it). */
export function linkedItemHref(item: NonNullable<Task["linked_item"]>): string | null {
  const ref = encodeURIComponent(item.reference);
  switch (item.kind) {
    case "international-order":
      return `/orders/international?open=${item.id}`;
    case "express-delivery":
      return `/orders/express?search=${ref}`;
    case "service-order":
      return `/orders/equipment-support?open=${item.id}`;
    case "quote":
      return `/intake-quotes?search=${ref}`;
    default:
      return null;
  }
}
