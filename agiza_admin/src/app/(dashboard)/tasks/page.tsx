import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { TasksView } from "./view";

export const metadata = { title: "Tasks" };

export default function Page() {
  return (
    <ModuleGuard module="tasks">
      <Suspense>
        <TasksView />
      </Suspense>
    </ModuleGuard>
  );
}
