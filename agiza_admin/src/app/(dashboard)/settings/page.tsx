import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { SettingsView } from "./view";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <ModuleGuard module="settings">
      <Suspense>
        <SettingsView />
      </Suspense>
    </ModuleGuard>
  );
}
