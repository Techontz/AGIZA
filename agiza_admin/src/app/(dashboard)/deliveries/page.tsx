import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { DeliveriesView } from "./view";

export const metadata = { title: "Deliveries" };

export default function Page() {
  return (
    <ModuleGuard module="deliveries">
      <Suspense>
        <DeliveriesView />
      </Suspense>
    </ModuleGuard>
  );
}
