import { api } from "../client";
import type { Access, ModuleKey, StaffLevel } from "../types";

/* ------------------------------------------------------------ tag rules */

export type RuleField = "total_spent" | "total_orders" | "inactive_days" | "category" | "last_order_days";
export type RuleOperator = ">" | "<" | "=" | "includes";

export interface RuleCondition {
  id: number;
  field: RuleField;
  field_display: string;
  operator: RuleOperator;
  operator_display: string;
  value: string;
}

export interface RuleRun {
  id: number;
  matched: number;
  added: number;
  removed: number;
  /** save / manual / scheduled / activity */
  trigger: string;
  run_by: { id: number; full_name: string } | null;
  created_at: string;
}

export interface TagRule {
  id: number;
  name: string;
  tag: string;
  enabled: boolean;
  conditions: RuleCondition[];
  last_run_at: string | null;
  last_matched: number;
  tagged_customers: number;
  last_run: RuleRun | null;
  created_at: string;
  updated_at: string;
}

export interface TagRuleInput {
  name: string;
  tag: string;
  enabled: boolean;
  conditions: { field: RuleField; operator: RuleOperator; value: string }[];
}

export interface RuleChoices {
  fields: { value: RuleField; label: string }[];
  operators: { value: RuleOperator; label: string }[];
}

export interface RunAllResult {
  rules: number;
  added: number;
  removed: number;
}

/** Operators the backend accepts for each field (services.condition_q). */
export function operatorsFor(field: RuleField): RuleOperator[] {
  return field === "category" ? ["includes", "="] : [">", "<", "="];
}

export const RULE_TRIGGERS: Record<string, string> = {
  save: "Saved",
  manual: "Manual run",
  scheduled: "Scheduled",
  activity: "Customer activity",
};

/* ----------------------------------------------------- role permissions */

export interface RolePermission {
  id: number;
  staff_level: Exclude<StaffLevel, "top_admin">;
  staff_level_display: string;
  module: ModuleKey;
  module_display: string;
  access: Access;
  updated_at: string;
}

/** Matrix order from backend/apps/accounts/constants.py. */
export const MATRIX_LEVELS: Exclude<StaffLevel, "top_admin">[] = [
  "admin_l2",
  "admin_l1",
  "sales",
  "finance",
  "procurement",
  "data_entry",
  "driver",
];

export const STAFF_LEVEL_LABELS: Record<StaffLevel, string> = {
  top_admin: "Top Admin",
  admin_l2: "Admin Level 2",
  admin_l1: "Admin Level 1",
  sales: "Sales",
  finance: "Finance",
  procurement: "Procurement",
  data_entry: "Data Entry",
  driver: "Driver",
};

export const MODULE_ORDER: ModuleKey[] = [
  "intake_quotes",
  "orders",
  "deliveries",
  "returns",
  "tasks",
  "procurement",
  "shipping",
  "chat",
  "ecommerce",
  "warehouse",
  "finance",
  "shipping_engine",
  "people",
  "audit_logs",
  "settings",
];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  intake_quotes: "Intake & Quotes",
  orders: "Orders",
  deliveries: "Deliveries",
  returns: "Returns",
  tasks: "Tasks",
  procurement: "Procurement",
  shipping: "Shipping & Tracking",
  chat: "Chat & Customer Support",
  ecommerce: "E-commerce Platform",
  warehouse: "Warehouse & Pick Up Points",
  finance: "Finance",
  shipping_engine: "Shipping Engine",
  people: "People",
  audit_logs: "Reporting & Audit Logs",
  settings: "Settings",
};

export const ACCESS_LEVELS: Access[] = ["none", "view", "edit", "manage"];
export const ACCESS_RANK: Record<Access, number> = { none: 0, view: 1, edit: 2, manage: 3 };
export const ACCESS_LABELS: Record<Access, string> = { none: "No access", view: "View", edit: "Edit", manage: "Manage" };

/* -------------------------------------------------- chat configuration */

export interface QuickReply {
  id: number;
  text: string;
  sort_order: number;
  is_active: boolean;
}

export type QuickReplyInput = Pick<QuickReply, "text" | "sort_order" | "is_active">;

/** `GET chat/conversations/channels/`: which messaging channels are connected. */
export type ChannelStatus = Partial<Record<"whatsapp" | "facebook" | "tiktok" | "sms" | "email" | "web", boolean>>;

/* ---------------------------------------------------------------- service */

export const settingsApi = {
  tagRules: {
    list: (signal?: AbortSignal) => api.get<TagRule[]>("crm/tag-rules", undefined, signal),
    choices: () => api.get<RuleChoices>("crm/tag-rules/fields"),
    create: (data: TagRuleInput) => api.post<TagRule>("crm/tag-rules", data),
    update: (id: number, data: TagRuleInput) => api.patch<TagRule>(`crm/tag-rules/${id}`, data),
    remove: (id: number) => api.delete(`crm/tag-rules/${id}`),
    toggle: (id: number) => api.post<TagRule>(`crm/tag-rules/${id}/toggle`),
    run: (id: number) => api.post<TagRule>(`crm/tag-rules/${id}/run`),
    runAll: () => api.post<RunAllResult>("crm/tag-rules/run-all"),
    runs: (id: number) => api.get<RuleRun[]>(`crm/tag-rules/${id}/runs`),
  },
  rolePermissions: {
    list: () => api.get<RolePermission[]>("role-permissions"),
    update: (id: number, access: Access) => api.patch<RolePermission>(`role-permissions/${id}`, { access }),
  },
  quickReplies: {
    list: () => api.get<QuickReply[]>("chat/quick-replies", { all: 1 }),
    create: (data: QuickReplyInput) => api.post<QuickReply>("chat/quick-replies", data),
    update: (id: number, data: Partial<QuickReplyInput>) => api.patch<QuickReply>(`chat/quick-replies/${id}`, data),
    remove: (id: number) => api.delete(`chat/quick-replies/${id}`),
  },
  channels: () => api.get<ChannelStatus>("chat/conversations/channels"),
};

export const settingsKeys = {
  tagRules: ["crm", "tag-rules"] as const,
  ruleChoices: ["crm", "tag-rules", "choices"] as const,
  ruleRuns: (id: number) => ["crm", "tag-rules", id, "runs"] as const,
  rolePermissions: ["role-permissions"] as const,
  quickReplies: ["chat", "quick-replies", "all"] as const,
  channels: ["chat", "channels"] as const,
};
