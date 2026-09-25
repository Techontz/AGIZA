import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

/** Every Shipping Engine page: permission guard + Suspense for URL state. */
export function EngineRoute({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGuard module="shipping_engine">
      <Suspense>{children}</Suspense>
    </ModuleGuard>
  );
}
