"use client";

import { useQuery } from "@tanstack/react-query";
import { Edit, Plus, Truck } from "lucide-react";
import { useState } from "react";

import { CarrierForm } from "@/components/shipping-engine/carrier-form";
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
import { ErrorState } from "@/components/ui/states";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { engine, seKeys, type Carrier } from "@/lib/api/services/shipping-engine";
import { pageMeta } from "@/lib/nav";

export function CarriersView() {
  const meta = pageMeta["/shipping-engine/carriers"];
  const { canEdit, canManage } = useEngineAccess();
  const [f, setF] = useUrlFilters({ new: "", edit: "" });
  const q = useQuery({ queryKey: seKeys.list("carriers", { all: true }), queryFn: () => engine.carriers.all() });
  const editing = f.edit ? q.data?.find((c) => String(c.id) === f.edit) ?? null : null;
  const [toDelete, setToDelete] = useState<Carrier | null>(null);
  const toggle = useEngineMutation(
    (c: Carrier) => engine.carriers.update(c.id, { status: c.status === "active" ? "inactive" : "active" }),
    { success: "Carrier updated" },
  );
  const remove = useEngineMutation((c: Carrier) => engine.carriers.remove(c.id), {
    success: "Carrier deleted",
    onSuccess: () => setToDelete(null),
  });

  return (
    <EnginePage>
      <CarrierForm open={f.new === "1" || Boolean(editing)} onClose={() => setF({ new: "", edit: "" })} carrier={editing} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete carrier"
        message={`Delete ${toDelete?.name}? Carriers used by rules or shipping methods can't be deleted — deactivate them instead.`}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => setToDelete(null)}
        loading={remove.isPending}
      />
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={canEdit && <Btn variant="primary" icon={Plus} onClick={() => setF({ new: "1" })}>Add Carrier</Btn>}
      />
      {q.isPending ? (
        <CardListSkeleton />
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EngineEmpty
          icon={Truck}
          title="No carriers yet"
          action={canEdit && <Btn icon={Plus} onClick={() => setF({ new: "1" })}>Add Carrier</Btn>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {q.data.map((c) => (
            <SectionCard key={c.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-5">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="bg-blue-50 p-3 rounded-xl flex-shrink-0">
                    <Truck className="size-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{c.name}</h3>
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{c.type_display}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{[c.contact_email, c.contact_phone].filter(Boolean).join(" · ") || "No contact details"}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-500">Origins: {c.origin_names.join(", ") || "—"}</span>
                      {c.specializations.length > 0 && <span className="text-gray-300">|</span>}
                      {c.specializations.map((s) => (
                        <span key={s} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 self-end sm:self-auto">
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{c.routes_count}</p>
                    <p className="text-xs text-gray-500">routes</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && <IconButton icon={Edit} label={`Edit ${c.name}`} onClick={() => setF({ edit: String(c.id) })} />}
                    <RowMenu
                      items={[
                        { label: c.status === "active" ? "Deactivate" : "Activate", onClick: () => toggle.mutate(c), hidden: !canEdit },
                        { label: "Delete", onClick: () => setToDelete(c), danger: true, hidden: !canManage },
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
