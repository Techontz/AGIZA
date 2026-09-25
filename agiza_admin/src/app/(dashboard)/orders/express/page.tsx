import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { ExpressView } from "./view";

export const metadata = { title: "Express Delivery Management" };

export default function Page() {
  return (
    <ModuleGuard module="orders">
      <Suspense>
        <ExpressView />
      </Suspense>
    </ModuleGuard>
  );
}
