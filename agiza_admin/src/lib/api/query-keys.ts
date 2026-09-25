/** Central TanStack Query keys so invalidation stays consistent. */
export const queryKeys = {
  me: ["me"] as const,
  auditLogs: (query: object) => ["audit-logs", query] as const,
  countries: (query?: object) => ["countries", query ?? {}] as const,
  cities: (query?: object) => ["cities", query ?? {}] as const,
};
