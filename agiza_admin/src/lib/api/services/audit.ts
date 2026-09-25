import { api, type QueryParams } from "../client";
import type { AuditLog, Paginated } from "../types";

export interface AuditLogQuery extends QueryParams {
  page?: number;
  page_size?: number;
  search?: string;
  action?: string;
  entity?: string;
  actor?: number;
  date_from?: string;
  date_to?: string;
}

export const auditService = {
  list: (query: AuditLogQuery, signal?: AbortSignal) => api.get<Paginated<AuditLog>>("audit-logs", query, signal),
};

export const auditEntitiesService = {
  list: () => api.get<{ value: string; label: string }[]>("audit-logs/entities"),
};
