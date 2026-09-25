import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { InternationalView } from "./view";

export const metadata = { title: "International Orders" };

export default function Page() {
  return (
    <ModuleGuard module="orders">
      <Suspense>
        <InternationalView />
      </Suspense>
    </ModuleGuard>
  );
}
