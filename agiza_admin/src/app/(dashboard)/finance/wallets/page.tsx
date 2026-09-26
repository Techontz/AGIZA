import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { WalletsView } from "./view";

export const metadata = { title: "Wallets & Installments" };

export default function Page() {
  return (
    <ModuleGuard module="finance">
      <Suspense>
        <WalletsView />
      </Suspense>
    </ModuleGuard>
  );
}
