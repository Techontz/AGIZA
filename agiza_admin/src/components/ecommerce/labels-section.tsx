"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { catalogApi, catalogKeys, type Label, type LabelColor } from "@/lib/api/services/catalog";

import { DeleteDialog, IconSwitch, labelColorMap, miniInput, miniLabel, useCatalogAccess, useCatalogMutation, type Errors } from "./shared";

const COLORS: LabelColor[] = ["blue", "red", "yellow", "purple", "orange", "green", "gray"];

export function LabelsSection() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.labels, queryFn: ({ signal }) => catalogApi.labels.list(signal) });
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const [errors, setErrors] = useState<Errors>({});
  const [deleting, setDeleting] = useState<Label | null>(null);

  const create = useCatalogMutation((body: { name: string; color: LabelColor }) => catalogApi.labels.create({ ...body, visible: true }), {
    success: (l) => `${l.name} label added`,
    onSuccess: () => setName(""),
    setErrors,
  });
  const toggle = useCatalogMutation((l: Label) => catalogApi.labels.update(l.id, { visible: !l.visible }), {
    success: (l) => `${l.name} is now ${l.visible ? "visible" : "hidden"}`,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setErrors({});
    create.mutate({ name: name.trim(), color });
  };

  const labels = list.data ?? [];

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card className="p-6 shadow-none">
          <h2 className="text-base font-bold text-gray-900 mb-4">Add New Label</h2>
          <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="label-name" className={miniLabel}>Label Name *</label>
              <input
                id="label-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Flash Sale, Staff Pick"
                maxLength={60}
                aria-invalid={Boolean(errors.name) || undefined}
                className={`${miniInput} w-48`}
              />
            </div>
            <div>
              <label htmlFor="label-color" className={miniLabel}>Color</label>
              <select id="label-color" value={color} onChange={(e) => setColor(e.target.value as LabelColor)} className={miniInput}>
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center min-h-9">
              {name.trim() && <span className={`px-3 py-1 rounded-full text-xs font-bold ${labelColorMap[color]}`}>{name.trim()}</span>}
            </div>
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="size-4 inline mr-1.5" />
              {create.isPending ? "Adding…" : "Add Label"}
            </button>
          </form>
          {Object.values(errors).length > 0 && (
            <p role="alert" className="text-xs text-red-600 mt-2">{Object.values(errors).join(" ")}</p>
          )}
        </Card>
      )}

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 shadow-none flex items-center gap-3">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </Card>
          ))}
        </div>
      ) : labels.length === 0 ? (
        <EmptyState icon={Tag} title="No labels yet" description="Create a label like New Arrival or Sale to highlight products." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {labels.map((label) => (
            <div key={label.id} className="bg-white rounded-lg border border-gray-200 p-5 flex items-center justify-between gap-3 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`px-3 py-1.5 rounded-full text-sm font-bold truncate ${labelColorMap[label.color]}`}>{label.name}</span>
                <div>
                  <p className="text-xs text-gray-500">
                    {label.products_count} product{label.products_count !== 1 ? "s" : ""}
                  </p>
                  <p className={`text-xs font-medium mt-0.5 ${label.visible ? "text-green-600" : "text-gray-400"}`}>{label.visible ? "Visible" : "Hidden"}</p>
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <IconSwitch
                    checked={label.visible}
                    onChange={() => toggle.mutate(label)}
                    disabled={toggle.isPending && toggle.variables?.id === label.id}
                    label={`${label.name} visible`}
                  />
                  <button
                    type="button"
                    onClick={() => setDeleting(label)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete label"
                    aria-label={`Delete ${label.name} label`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Tip:</strong> Labels appear as badges on product cards in your store. Assign labels to products from the Product edit page under Shop &amp; Discovery settings.
      </div>

      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Label"
        name={deleting?.name ?? ""}
        onDelete={() => catalogApi.labels.remove(deleting!.id)}
        onDeactivate={deleting?.visible ? () => catalogApi.labels.update(deleting.id, { visible: false }) : undefined}
        deactivateLabel="Hide Label Instead"
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
