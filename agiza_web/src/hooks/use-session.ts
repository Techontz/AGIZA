"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionApi, type Session } from "@/lib/api/endpoints";

export const SESSION_KEY = ["session"] as const;

export function useSession() {
  const query = useQuery({ queryKey: SESSION_KEY, queryFn: sessionApi.get, staleTime: 60_000 });
  const data: Session | undefined = query.data;
  return {
    ...query,
    customer: data?.customer ?? null,
    store: data?.store ?? null,
    signedIn: Boolean(data?.customer),
    ready: query.isSuccess || query.isError,
  };
}

export function useRefreshSession() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: SESSION_KEY });
}
