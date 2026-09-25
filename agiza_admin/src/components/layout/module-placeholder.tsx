"use client";

import { PlaceholderPage } from "@/components/ui/placeholder-page";
import { pageMeta } from "@/lib/nav";

import { ModuleGuard } from "./module-guard";

/** Figma "Coming Soon" page for modules whose phase hasn't been implemented yet. */
export function ModulePlaceholder({ path }: { path: string }) {
  const meta = pageMeta[path];
  return (
    <ModuleGuard module={meta.module}>
      <PlaceholderPage title={meta.title} description={meta.description} icon={meta.icon} />
    </ModuleGuard>
  );
}
