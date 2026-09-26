import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { InvoicesView } from "./view";

export const metadata = { title: "Invoices" };

export default function Page() {
  return (
    <ModuleGuard module="finance">
      <Suspense>
        <InvoicesView />
      </Suspense>
    </ModuleGuard>
  );
}
