"use client";

import { useQuery } from "@tanstack/react-query";
import { Edit, MapPin, Plus } from "lucide-react";
import { useState } from "react";

import { useEngineAccess, useEngineMutation } from "@/components/shipping-engine/hooks";
import {
  Btn,
  CardListSkeleton,
  ConfirmDialog,
  EngineEmpty,
  EnginePage,
  IconButton,
  PageHeader,
  RowMenu,
  SectionCard,
  StatusBadge,
} from "@/components/shipping-engine/ui";
import { ZoneForm } from "@/components/shipping-engine/zone-form";
import { ErrorState } from "@/components/ui/states";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { engine, seKeys, type Zone } from "@/lib/api/services/shipping-engine";
import { pageMeta } from "@/lib/nav";

export function ZonesView() {
  const meta = pageMeta["/shipping-engine/zones"];
  const { canEdit, canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({ new: "", edit: "" });
  const q = useQuery({ queryKey: seKeys.list("zones", { all: true }), queryFn: () => engine.zones.all() });

  const editing = f.edit ? q.data?.find((z) => String(z.id) === f.edit) ?? null : null;
  const [toDelete, setToDelete] = useState<Zone | null>(null);
  const setStatus = useEngineMutation(
    ({ zone, status }: { zone: Zone; status: string }) => engine.zones.update(zone.id, { status }),
    { success: "Zone updated" },
  );
  const remove = useEngineMutation((z: Zone) => engine.zones.remove(z.id), {
    success: "Zone deleted",
    onSuccess: () => setToDelete(null),
  });

  return (
    <EnginePage>
      <ZoneForm open={f.new === "1" || Boolean(editing)} onClose={() => setF({ new: "", edit: "" })} zone={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete zone"
        message={`Delete ${toDelete?.name}? Zones used by routes can't be deleted — deactivate them instead.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={canEdit && <Btn variant="primary" icon={Plus} onClick={() => setF({ new: "1" })}>Create Zone</Btn>}
      />
      {q.isPending ? (
        <CardListSkeleton />
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EngineEmpty
          icon={MapPin}
          title="No shipping zones yet"
          description="Group destinations into zones to price many places with one rule."
          action={canEdit && <Btn icon={Plus} onClick={() => setF({ new: "1" })}>Create Zone</Btn>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {q.data.map((z) => (
            <SectionCard key={z.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between p-5">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="bg-purple-50 p-2.5 rounded-lg flex-shrink-0">
                    <MapPin className="size-5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900">{z.name}</h3>
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{z.type_display}</span>
                      <StatusBadge status={z.status} label={z.status_display} />
                    </div>
                    {z.description && <p className="text-sm text-gray-500 mb-3">{z.description}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {z.destinations.map((d) => (
                        <span key={`${d.kind}:${d.ref_id}`} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                          {d.name}
                        </span>
                      ))}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setF({ edit: String(z.id) })}
                          className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs hover:bg-blue-100"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 self-end sm:self-auto">
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{z.rules_count}</p>
                    <p className="text-xs text-gray-500">rules</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && <IconButton icon={Edit} label={`Edit ${z.name}`} onClick={() => setF({ edit: String(z.id) })} />}
                    <RowMenu
                      items={[
                        { label: "Activate", onClick: () => setStatus.mutate({ zone: z, status: "active" }), hidden: !canEdit || z.status === "active" },
                        { label: "Deactivate", onClick: () => setStatus.mutate({ zone: z, status: "inactive" }), hidden: !canEdit || z.status === "inactive" },
                        { label: "Mark as draft", onClick: () => setStatus.mutate({ zone: z, status: "draft" }), hidden: !canEdit || z.status === "draft" },
                        { label: "Delete", onClick: () => setToDelete(z), danger: true, hidden: !canManage },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </EnginePage>
  );
}
