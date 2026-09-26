import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { ProcurementView } from "./view";

export const metadata = { title: "Procurement" };

export default function Page() {
  return (
    <ModuleGuard module="procurement">
      <Suspense>
        <ProcurementView />
      </Suspense>
    </ModuleGuard>
  );
}
