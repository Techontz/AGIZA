import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { WarehouseView } from "./view";

export const metadata = { title: "Warehouse & Pick Up Points" };

export default function Page() {
  return (
    <ModuleGuard module="warehouse">
      <Suspense>
        <WarehouseView />
      </Suspense>
    </ModuleGuard>
  );
}
