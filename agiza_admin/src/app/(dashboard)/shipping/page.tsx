import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { ShippingView } from "./view";

export const metadata = { title: "Shipping & Tracking" };

export default function Page() {
  return (
    <ModuleGuard module="shipping">
      <Suspense>
        <ShippingView />
      </Suspense>
    </ModuleGuard>
  );
}
