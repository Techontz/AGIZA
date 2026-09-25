"use client";

import { ErrorState, NoAccess } from "@/components/ui/states";
import { can, useMe } from "@/hooks/use-me";
import type { Access, ModuleKey } from "@/lib/api/types";

/**
 * Shows the page only if the user's role grants access to `module`.
 * This is a UX convenience: Django rejects unauthorised API calls regardless.
 */
export function ModuleGuard({
  module,
  level = "view",
  children,
}: {
  module: ModuleKey;
  level?: Access;
  children: React.ReactNode;
}) {
  const { data: me, isLoading, isError, refetch } = useMe();
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="max-w-[1600px] mx-auto space-y-4">
          <div className="h-9 w-72 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-96 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-6">
        <div className="max-w-[1600px] mx-auto">
          <ErrorState message="Could not load your account." onRetry={() => refetch()} />
        </div>
      </div>
    );
  }
  if (!can(me, module, level)) return <NoAccess />;
  return <>{children}</>;
}
