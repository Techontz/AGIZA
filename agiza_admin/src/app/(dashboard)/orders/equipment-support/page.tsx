import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { EquipmentView } from "./view";

export const metadata = { title: "Equipment Support Orders" };

export default function Page() {
  return (
    <ModuleGuard module="orders">
      <Suspense>
        <EquipmentView />
      </Suspense>
    </ModuleGuard>
  );
}
