/** Shapes returned by the Django REST API. */

export type Access = "none" | "view" | "edit" | "manage";

export type ModuleKey =
  | "intake_quotes"
  | "orders"
  | "deliveries"
  | "returns"
  | "tasks"
  | "procurement"
  | "shipping"
  | "chat"
  | "ecommerce"
  | "warehouse"
  | "finance"
  | "shipping_engine"
  | "people"
  | "audit_logs"
  | "settings";

export interface Paginated<T> {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> | unknown[] | null };
}

export type StaffLevel =
  | "top_admin"
  | "admin_l2"
  | "admin_l1"
  | "sales"
  | "finance"
  | "procurement"
  | "data_entry"
  | "driver";

export interface Me {
  id: number;
  employee_id: string;
  email: string;
  full_name: string;
  phone: string;
  initials: string;
  staff_level: StaffLevel;
  staff_level_display: string;
  department: string;
  department_display: string;
  is_top_admin: boolean;
  permissions: Record<ModuleKey, Access>;
  last_login: string | null;
  date_joined: string;
}

export interface UserSummary {
  id: number;
  employee_id: string;
  full_name: string;
  email: string;
  staff_level: StaffLevel;
  department: string;
}

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "login"
  | "logout"
  | "login_failed"
  | "password_change"
  | "permission_change";

export interface AuditLog {
  id: number;
  actor: UserSummary | null;
  action: AuditAction;
  action_display: string;
  entity: string | null;
  object_id: string;
  object_repr: string;
  changes: Record<string, [unknown, unknown]>;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
}

export interface Country {
  id: number;
  iso2: string;
  name: string;
  display_name: string;
  currency: string;
  is_sourcing_origin: boolean;
  is_active: boolean;
}

export interface City {
  id: number;
  name: string;
  region: number;
  region_name: string;
  country: number;
  country_iso2: string;
  is_active: boolean;
}
