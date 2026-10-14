import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { CancelledOrdersView } from "./view";

export const metadata = { title: "Cancelled Orders" };

export default function Page() {
  return (
    <ModuleGuard module="orders">
      <Suspense>
        <CancelledOrdersView />
      </Suspense>
    </ModuleGuard>
  );
}
