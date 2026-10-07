import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { ProfitLossView } from "./view";

export const metadata = { title: "Profit & Loss" };

export default function Page() {
  return (
    <ModuleGuard module="finance">
      <Suspense>
        <ProfitLossView />
      </Suspense>
    </ModuleGuard>
  );
}
