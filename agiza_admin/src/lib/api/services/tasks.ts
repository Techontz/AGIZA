import { api, type QueryParams } from "../client";
import type { Paginated } from "../types";
import type { PersonRef, Transition } from "./orders";

/* ------------------------------------------------------------------ types */

export type TaskType =
  | "generate_quote"
  | "verify_payment"
  | "assign_cargo"
  | "follow_up_client"
  | "customs_clearance"
  | "arrange_delivery"
  | "quality_check"
  | "pricing_approval"
  | "other";

export type TaskStatus =
  | "in_progress"
  | "waiting_for_client"
  | "waiting_for_payment"
  | "blocked"
  | "review_required"
  | "completed"
  | "cancelled";

export type TaskDepartment =
  | "unassigned"
  | "sales"
  | "procurement"
  | "shipping"
  | "delivery"
  | "finance"
  | "support"
  | "warehouse";

export type TaskPriority = "high" | "medium" | "low";

export type TaskView = "mine" | "unassigned" | "overdue" | "due_today" | "all";

export type LinkedKind = "international-order" | "express-delivery" | "service-order" | "ecommerce-order" | "quote" | "order";

export interface TaskActivity {
  id: number;
  kind: "note" | "status" | "owner" | "created";
  kind_display: string;
  body: string;
  from_status: string;
  to_status: string;
  actor: PersonRef | null;
  created_at: string;
}

export interface Task {
  id: number;
  reference: string;
  task_type: TaskType;
  task_type_display: string;
  status: TaskStatus;
  status_display: string;
  priority: TaskPriority;
  linked_item: { kind: LinkedKind; id: number; reference: string; order_type: string | null } | null;
  owner: { id: number; full_name: string; role: string } | null;
  department: TaskDepartment;
  department_display: string;
  sla_deadline: string;
  description: string;
  notes: TaskActivity[];
  is_overdue: boolean;
  is_open: boolean;
  completed_at: string | null;
  allowed_transitions: Transition[];
  created_at: string;
  updated_at: string;
}

export interface TaskStats {
  mine: number;
  unassigned: number;
  overdue: number;
  due_today: number;
  total: number;
}

export interface TaskOwner {
  id: number;
  full_name: string;
  staff_level: string;
  role: string;
}

export interface TaskCreateInput {
  task_type: TaskType;
  description: string;
  sla_deadline: string;
  department: TaskDepartment;
  priority: TaskPriority;
  status: TaskStatus;
  owner?: number | null;
  order?: number | null;
  quote?: number | null;
}

/* ----------------------------------------------------------------- labels */

export const TASK_TYPES: Record<TaskType, [string, string]> = {
  generate_quote: ["bg-blue-100 text-blue-800", "Generate Quote"],
  verify_payment: ["bg-green-100 text-green-800", "Verify Payment"],
  assign_cargo: ["bg-purple-100 text-purple-800", "Assign Cargo"],
  follow_up_client: ["bg-orange-100 text-orange-800", "Follow Up Client"],
  customs_clearance: ["bg-red-100 text-red-800", "Customs Clearance"],
  arrange_delivery: ["bg-cyan-100 text-cyan-800", "Arrange Delivery"],
  quality_check: ["bg-indigo-100 text-indigo-800", "Quality Check"],
  pricing_approval: ["bg-yellow-100 text-yellow-800", "Pricing Approval"],
  other: ["bg-gray-100 text-gray-800", "Other"],
};

export const TASK_STATUSES: Record<TaskStatus, [string, string]> = {
  waiting_for_client: ["bg-yellow-100 text-yellow-800", "Waiting for Client"],
  waiting_for_payment: ["bg-orange-100 text-orange-800", "Waiting for Payment"],
  in_progress: ["bg-blue-100 text-blue-800", "In Progress"],
  blocked: ["bg-red-100 text-red-800", "Blocked"],
  review_required: ["bg-purple-100 text-purple-800", "Review Required"],
  completed: ["bg-green-100 text-green-800", "Completed"],
  cancelled: ["bg-gray-100 text-gray-600", "Cancelled"],
};

export const TASK_DEPARTMENTS: Record<TaskDepartment, [string, string]> = {
  unassigned: ["bg-gray-100 text-gray-800", "Unassigned"],
  sales: ["bg-pink-100 text-pink-800", "Sales"],
  procurement: ["bg-blue-100 text-blue-800", "Procurement"],
  shipping: ["bg-purple-100 text-purple-800", "Shipping"],
  delivery: ["bg-green-100 text-green-800", "Delivery"],
  finance: ["bg-orange-100 text-orange-800", "Finance"],
  support: ["bg-cyan-100 text-cyan-800", "Support"],
  warehouse: ["bg-indigo-100 text-indigo-800", "Warehouse"],
};

export const TASK_PRIORITIES: Record<TaskPriority, string> = { high: "High", medium: "Medium", low: "Low" };

export const LINKED_KIND_LABEL: Record<LinkedKind, string> = {
  "international-order": "International order",
  "express-delivery": "Express delivery",
  "service-order": "Service order",
  "ecommerce-order": "Ecommerce order",
  quote: "Quote",
  order: "Order",
};

/* ---------------------------------------------------------------- service */

export const tasksApi = {
  list: (query: QueryParams, signal?: AbortSignal) => api.get<Paginated<Task>>("tasks", query, signal),
  get: (id: number) => api.get<Task>(`tasks/${id}`),
  stats: () => api.get<TaskStats>("tasks/stats"),
  owners: () => api.get<TaskOwner[]>("tasks/owners"),
  create: (data: TaskCreateInput) => api.post<Task>("tasks", data),
  update: (id: number, data: Partial<Pick<TaskCreateInput, "task_type" | "description" | "sla_deadline" | "department" | "priority">>) =>
    api.patch<Task>(`tasks/${id}`, data),
  changeStatus: (id: number, status: TaskStatus, note = "") => api.post<Task>(`tasks/${id}/status`, { status, note }),
  complete: (id: number, note = "") => api.post<Task>(`tasks/${id}/complete`, { note }),
  assign: (id: number, owner: number | null) => api.post<Task>(`tasks/${id}/assign`, { owner }),
  notes: (id: number) => api.get<TaskActivity[]>(`tasks/${id}/notes`),
  addNote: (id: number, body: string) => api.post<TaskActivity[]>(`tasks/${id}/notes`, { body }),
  activity: (id: number) => api.get<TaskActivity[]>(`tasks/${id}/activity`),
};

export const taskKeys = {
  all: ["tasks"] as const,
  list: (query: object) => ["tasks", "list", query] as const,
  one: (id: number) => ["tasks", "one", id] as const,
  activity: (id: number) => ["tasks", "one", id, "activity"] as const,
  stats: ["tasks", "stats"] as const,
  owners: ["tasks", "owners"] as const,
};
