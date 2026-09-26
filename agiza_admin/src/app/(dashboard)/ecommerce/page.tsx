import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { EcommerceView } from "./view";

export const metadata = { title: "E-commerce Platform" };

export default function Page() {
  return (
    <ModuleGuard module="ecommerce">
      <Suspense>
        <EcommerceView />
      </Suspense>
    </ModuleGuard>
  );
}
