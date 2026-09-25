import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { IntakeView } from "./view";

export const metadata = { title: "Intake & Quotes" };

export default function Page() {
  return (
    <ModuleGuard module="intake_quotes">
      <Suspense>
        <IntakeView />
      </Suspense>
    </ModuleGuard>
  );
}
