import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { PeopleView } from "./view";

export const metadata = { title: "People" };

export default function Page() {
  return (
    <ModuleGuard module="people">
      <Suspense>
        <PeopleView />
      </Suspense>
    </ModuleGuard>
  );
}
