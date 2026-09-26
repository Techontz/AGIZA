"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { errorText } from "@/lib/api/errors";

/**
 * Run an API call that changes data: refresh the given query keys, toast the
 * outcome. Business rules are enforced by Django; its error message is shown.
 */
export function useApiMutation<V, R = unknown>(
  fn: (vars: V) => Promise<R>,
  opts: {
    invalidate?: QueryKey[];
    success?: string | ((r: R) => string);
    onSuccess?: (r: R) => void;
    onError?: (e: unknown) => void;
  } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      for (const key of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: key });
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (err) => {
      if (opts.onError) opts.onError(err);
      else toast.error(errorText(err));
    },
  });
}
