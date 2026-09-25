import { Suspense } from "react";

import { ModuleGuard } from "@/components/layout/module-guard";

import { AuditLogsView } from "./view";

export const metadata = { title: "Reporting & Audit Logs" };

export default function AuditLogsPage() {
  return (
    <ModuleGuard module="audit_logs">
      <Suspense>
        <AuditLogsView />
      </Suspense>
    </ModuleGuard>
  );
}
