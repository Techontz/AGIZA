import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { ChatView } from "./view";

export const metadata = { title: "Transaction Chat" };

export default function Page() {
  return (
    <ModuleGuard module="chat">
      <Suspense>
        <ChatView />
      </Suspense>
    </ModuleGuard>
  );
}
