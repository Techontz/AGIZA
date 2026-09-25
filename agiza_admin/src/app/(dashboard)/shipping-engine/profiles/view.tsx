"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy, Edit, Info, Layers, Plus } from "lucide-react";
import { useState } from "react";

import { useEngineAccess, useEngineMutation } from "@/components/shipping-engine/hooks";
import { ProfileForm } from "@/components/shipping-engine/profile-form";
import {
  Btn,
  CardListSkeleton,
  ConfirmDialog,
  EngineEmpty,
  EnginePage,
  IconButton,
  InfoBanner,
  PageHeader,
  RowMenu,
  SectionCard,
  StatusBadge,
} from "@/components/shipping-engine/ui";
import { ErrorState } from "@/components/ui/states";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/cn";
import { engine, seKeys, type ShippingProfile } from "@/lib/api/services/shipping-engine";
import { pageMeta } from "@/lib/nav";

// Colours exactly as in the design.
const TYPE_STYLE: Record<string, { box: string; icon: string; badge: string }> = {
  restricted: { box: "bg-red-50", icon: "text-red-600", badge: "bg-red-100 text-red-700" },
  oversized: { box: "bg-orange-50", icon: "text-orange-600", badge: "bg-orange-100 text-orange-700" },
  manual: { box: "bg-gray-50", icon: "text-gray-500", badge: "bg-gray-100 text-gray-600" },
  default: { box: "bg-indigo-50", icon: "text-indigo-600", badge: "bg-indigo-100 text-indigo-700" },
};
const HANDLING_STYLE: Record<string, string> = {
  contains_battery: "bg-orange-50 text-orange-700",
  special_documentation: "bg-blue-50 text-blue-700",
  restricted: "bg-red-50 text-red-700",
  fragile: "bg-yellow-50 text-yellow-700",
  hazardous: "bg-red-50 text-red-700",
};

export function ProfilesView() {
  const meta = pageMeta["/shipping-engine/profiles"];
  const { canEdit, canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({ new: "", edit: "" });
  const q = useQuery({ queryKey: seKeys.list("profiles", { all: true }), queryFn: () => engine.profiles.all() });
  const editing = f.edit ? q.data?.find((p) => String(p.id) === f.edit) ?? null : null;
  const [toDelete, setToDelete] = useState<ShippingProfile | null>(null);

  const duplicate = useEngineMutation((p: ShippingProfile) => engine.profiles.duplicate(p.id), {
    success: (p) => `Created ${(p as ShippingProfile).name} (inactive until you review it)`,
  });
  const toggle = useEngineMutation(
    (p: ShippingProfile) => engine.profiles.update(p.id, { status: p.status === "active" ? "inactive" : "active" }),
    { success: "Profile updated" },
  );
  const remove = useEngineMutation((p: ShippingProfile) => engine.profiles.remove(p.id), {
    success: "Profile deleted",
    onSuccess: () => setToDelete(null),
  });

  return (
    <EnginePage>
      <ProfileForm open={f.new === "1" || Boolean(editing)} onClose={() => setF({ new: "", edit: "" })} profile={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete profile"
        message={`Delete ${toDelete?.name}? Profiles used by rules or overrides can't be deleted — deactivate them instead.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={canEdit && <Btn variant="primary" icon={Plus} onClick={() => setF({ new: "1" })}>Create Profile</Btn>}
      />
      <InfoBanner tone="yellow" icon={Info} className="mb-6">
        A product&apos;s <strong>weight</strong> and <strong>CBM</strong> are always stored on the product — the Shipping
        Profile determines <strong>which pricing rule applies</strong>, not the physical dimensions.
      </InfoBanner>
      {q.isPending ? (
        <CardListSkeleton />
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EngineEmpty
          icon={Layers}
          title="No shipping profiles yet"
          description="Profiles group products that ship the same way (e.g. Electronics, Drones, Oversized)."
          action={canEdit && <Btn icon={Plus} onClick={() => setF({ new: "1" })}>Create Profile</Btn>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {q.data.map((p) => {
            const style = TYPE_STYLE[p.type] ?? TYPE_STYLE.default;
            return (
              <SectionCard key={p.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-5">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn("p-2.5 rounded-lg flex-shrink-0", style.box)}>
                      <Layers className={cn("size-5", style.icon)} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{p.name}</h3>
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", style.badge)}>{p.type_display}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      {p.description && <p className="text-sm text-gray-500 mb-2">{p.description}</p>}
                      {p.handling.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {p.handling.map((h, i) => (
                            <span key={h} className={cn("px-2 py-0.5 rounded text-xs font-medium", HANDLING_STYLE[h] ?? "bg-gray-100 text-gray-600")}>
                              {p.handling_display[i]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 self-end sm:self-auto">
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{p.products_count}</p>
                      <p className="text-xs text-gray-500">products</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && <IconButton icon={Edit} label={`Edit ${p.name}`} onClick={() => setF({ edit: String(p.id) })} />}
                      {canEdit && <IconButton icon={Copy} label={`Duplicate ${p.name}`} onClick={() => duplicate.mutate(p)} disabled={duplicate.isPending} />}
                      <RowMenu
                        items={[
                          { label: p.status === "active" ? "Deactivate" : "Activate", onClick: () => toggle.mutate(p), hidden: !canEdit },
                          { label: "Delete", onClick: () => setToDelete(p), danger: true, hidden: !canManage },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </EnginePage>
  );
}
