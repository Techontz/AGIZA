"use client";

import { AppSlidersCard } from "@/components/settings/app-sliders-card";
import { ChatSettingsCard } from "@/components/settings/chat-settings-card";
import { RolePermissionsCard } from "@/components/settings/role-permissions-card";
import { TagRulesCard } from "@/components/settings/tag-rules-card";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { can, useMe } from "@/hooks/use-me";
import { pageMeta } from "@/lib/nav";

export function SettingsView() {
  const meta = pageMeta["/settings"];
  const { data: me } = useMe();

  return (
    <PageContainer className="max-w-[1400px]">
      <PageHeader title={meta.title} description={meta.description} />
      <TagRulesCard canManage={can(me, "settings", "manage")} />
      <RolePermissionsCard editable={Boolean(me?.is_top_admin)} />
      <AppSlidersCard
        canView={can(me, "settings", "view") || can(me, "ecommerce", "view")}
        canEdit={can(me, "settings", "edit") || can(me, "ecommerce", "edit")}
      />
      <ChatSettingsCard canView={can(me, "chat", "view")} canManage={can(me, "chat", "manage")} />
    </PageContainer>
  );
}
