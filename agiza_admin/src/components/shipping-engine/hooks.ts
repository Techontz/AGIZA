"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { can, useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { engine, seKeys } from "@/lib/api/services/shipping-engine";
import { locationsService } from "@/lib/api/services/locations";

/** UI permission hints for the engine (Django enforces the real rules). */
export function useEngineAccess() {
  const { data: me } = useMe();
  return {
    canEdit: can(me, "shipping_engine", "edit"),
    canManage: can(me, "shipping_engine", "manage"),
  };
}

/** Invalidate everything under the engine prefix after a change (counts cross resources). */
export function useEngineMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  { success, onSuccess }: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: seKeys.all });
      if (success) toast.success(typeof success === "function" ? success(result) : success);
      onSuccess?.(result);
    },
    onError: (err) => {
      // Field errors are shown inline by the forms; anything else becomes a toast.
      if (!(err instanceof ApiError && err.status === 400 && Object.keys(err.fieldErrors).length > 0)) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    },
  });
}

/* Reference lists used by several forms. */
export const useMethodOptions = () =>
  useQuery({ queryKey: seKeys.list("methods", { all: true }), queryFn: () => engine.methods.all() });
export const useProfileOptions = () =>
  useQuery({ queryKey: seKeys.list("profiles", { all: true }), queryFn: () => engine.profiles.all() });
export const useCarrierOptions = () =>
  useQuery({ queryKey: seKeys.list("carriers", { all: true }), queryFn: () => engine.carriers.all() });
export const useZoneOptions = () =>
  useQuery({ queryKey: seKeys.list("zones", { all: true }), queryFn: () => engine.zones.all() });
export const useRouteOptions = () =>
  useQuery({ queryKey: seKeys.list("routes", { all: true }), queryFn: () => engine.routes.all() });

export const useCountries = () =>
  useQuery({ queryKey: queryKeys.countries(), queryFn: () => locationsService.countries(), staleTime: 60 * 60_000 });
export const useCities = (country?: number) =>
  useQuery({
    queryKey: queryKeys.cities({ country }),
    queryFn: () => locationsService.cities(country ? { country } : undefined),
    staleTime: 60 * 60_000,
  });
export const useRegions = (country?: number) =>
  useQuery({
    queryKey: ["regions", { country }],
    queryFn: () => locationsService.regions(country ? { country } : undefined),
    staleTime: 60 * 60_000,
  });

/** Apply DRF field errors from a 400 response to a react-hook-form instance. */
export function applyFieldErrors(
  err: unknown,
  setError: (name: never, error: { message: string }) => void,
  fields: readonly string[],
): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const unmatched: string[] = [];
  for (const [field, message] of Object.entries(err.fieldErrors)) {
    if (fields.includes(field)) setError(field as never, { message });
    else unmatched.push(message);
  }
  return unmatched.length ? unmatched.join(" ") : Object.keys(err.fieldErrors).length ? null : err.message;
}
