import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { EcommerceOrdersView } from "./view";

export const metadata = { title: "E-commerce Shop Orders" };

export default function Page() {
  return (
    <ModuleGuard module="orders">
      <Suspense>
        <EcommerceOrdersView />
      </Suspense>
    </ModuleGuard>
  );
}
