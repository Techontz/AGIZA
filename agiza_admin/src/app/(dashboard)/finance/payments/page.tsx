import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { PaymentsView } from "./view";

export const metadata = { title: "Order Payments" };

export default function Page() {
  return (
    <ModuleGuard module="finance">
      <Suspense>
        <PaymentsView />
      </Suspense>
    </ModuleGuard>
  );
}
