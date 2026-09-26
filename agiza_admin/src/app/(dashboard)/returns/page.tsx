import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { ReturnsView } from "./view";

export const metadata = { title: "Returns" };

export default function Page() {
  return (
    <ModuleGuard module="returns">
      <Suspense>
        <ReturnsView />
      </Suspense>
    </ModuleGuard>
  );
}
