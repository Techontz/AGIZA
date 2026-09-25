"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/api/query-keys";
import { authService } from "@/lib/api/services/auth";
import type { Access, Me, ModuleKey } from "@/lib/api/types";

const RANK: Record<Access, number> = { none: 0, view: 1, edit: 2, manage: 3 };

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: authService.me, staleTime: 5 * 60_000 });
}

/** UI hint only: Django enforces every permission server-side. */
export function can(me: Me | undefined, module: ModuleKey, level: Access = "view"): boolean {
  if (!me) return false;
  return RANK[me.permissions[module] ?? "none"] >= RANK[level];
}
