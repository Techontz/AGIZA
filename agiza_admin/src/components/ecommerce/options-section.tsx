"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, ToggleLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { catalogApi, catalogKeys, type OptionInput, type OptionType, type OptionValue, type ProductOption } from "@/lib/api/services/catalog";

import { DeleteDialog, FormErrors, IconSwitch, miniInput, miniLabel, useCatalogAccess, useCatalogMutation, type Errors } from "./shared";

const TYPES: [OptionType, string][] = [
  ["size", "Size"],
  ["color", "Color"],
  ["bundle", "Bundle"],
  ["storage", "Storage"],
  ["text", "Text / Other"],
];

export function OptionsSection() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.options, queryFn: ({ signal }) => catalogApi.options.list(signal) });
  const [name, setName] = useState("");
  const [type, setType] = useState<OptionType>("text");
  const [errors, setErrors] = useState<Errors>({});
  const [editing, setEditing] = useState<ProductOption | null>(null);
  const [deleting, setDeleting] = useState<ProductOption | null>(null);

  const create = useCatalogMutation((body: { name: string; type: OptionType }) => catalogApi.options.create({ ...body, status: "active" }), {
    success: (o) => `${o.name} option set added`,
    onSuccess: () => setName(""),
    setErrors,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setErrors({});
    create.mutate({ name: name.trim(), type });
  };

  const options = list.data ?? [];

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card className="p-6 shadow-none">
          <h2 className="text-base font-bold text-gray-900 mb-4">Add New Option Set</h2>
          <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="opt-name" className={miniLabel}>Option Name *</label>
              <input
                id="opt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Shoe Size, RAM, Flavour"
                maxLength={60}
                aria-invalid={Boolean(errors.name) || undefined}
                className={`${miniInput} w-48`}
              />
            </div>
            <div>
              <label htmlFor="opt-type" className={miniLabel}>Type</label>
              <select id="opt-type" value={type} onChange={(e) => setType(e.target.value as OptionType)} className={miniInput}>
                {TYPES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="size-4 inline mr-1.5" />
              {create.isPending ? "Adding…" : "Add Option Set"}
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
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="shadow-none overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50"><Skeleton className="h-5 w-40" /></div>
              <div className="px-5 py-4 flex gap-2">
                {Array.from({ length: 4 }).map((__, j) => <Skeleton key={j} className="h-7 w-14 rounded-full" />)}
              </div>
            </Card>
          ))}
        </div>
      ) : options.length === 0 ? (
        <EmptyState icon={ToggleLeft} title="No option sets yet" description="Option sets like Size or Color are used to build product variations." />
      ) : (
        <div className="space-y-4">
          {options.map((opt) => (
            <OptionCard key={opt.id} option={opt} canEdit={canEdit} onEdit={() => setEditing(opt)} onDelete={() => setDeleting(opt)} />
          ))}
        </div>
      )}

      {editing && <OptionModal option={editing} onClose={() => setEditing(null)} />}
      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Option Set"
        name={deleting?.name ?? ""}
        onDelete={() => catalogApi.options.remove(deleting!.id)}
        onDeactivate={deleting?.status === "active" ? () => catalogApi.options.update(deleting.id, { status: "inactive" }) : undefined}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function OptionCard({ option, canEdit, onEdit, onDelete }: { option: ProductOption; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const [value, setValue] = useState("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<OptionValue | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const add = useCatalogMutation((v: string) => catalogApi.options.addValue(option.id, v), {
    onSuccess: () => setValue(""),
    setErrors: (e) => setValueError(Object.values(e).join(" ")),
  });
  const qc = useQueryClient();
  const [removePending, setRemovePending] = useState(false);
  const toggle = useCatalogMutation(() => catalogApi.options.update(option.id, { status: option.status === "active" ? "inactive" : "active" }), {
    success: (o) => `${o.name} is now ${o.status}`,
  });

  const submitValue = () => {
    const v = value.trim();
    if (!v) return;
    setValueError(null);
    add.mutate(v);
  };

  // Called directly (not via a mutation hook) so a 409 is shown in the dialog, not toasted too.
  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveError(null);
    setRemovePending(true);
    try {
      await catalogApi.options.removeValue(option.id, removing.id);
      qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast.success(`${removing.value} removed from ${option.name}`);
      setRemoving(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setRemoveError(err.message);
      else toast.error(errorText(err));
    } finally {
      setRemovePending(false);
    }
  };

  const n = option.values.length;
  const active = option.status === "active";

  return (
    <Card className="shadow-none overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-gray-900">{option.name}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono capitalize">{option.type}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {active ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{n} value{n !== 1 ? "s" : ""}</span>
          {canEdit && (
            <>
              <IconSwitch checked={active} onChange={() => toggle.mutate(undefined)} disabled={toggle.isPending} label={`${option.name} active`} />
              <button type="button" onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit option set" aria-label={`Edit ${option.name}`}>
                <Edit className="size-4" />
              </button>
              <button type="button" onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete option set" aria-label={`Delete ${option.name}`}>
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {n === 0 && <p className="text-sm text-gray-400">No values yet.</p>}
          {option.values.map((val) => (
            <div key={val.id} className="flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-sm">
              <span>{val.value}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveError(null);
                    setRemoving(val);
                  }}
                  className="text-gray-400 hover:text-red-500 ml-1 leading-none"
                  aria-label={`Remove ${val.value}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <>
            <div className="flex gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitValue();
                  }
                }}
                placeholder="Add a value..."
                maxLength={60}
                aria-label={`New value for ${option.name}`}
                aria-invalid={Boolean(valueError) || undefined}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
              <button
                type="button"
                onClick={submitValue}
                disabled={!value.trim() || add.isPending}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {add.isPending ? "Adding…" : "Add"}
              </button>
            </div>
            {valueError && <p role="alert" className="text-xs text-red-600 mt-1">{valueError}</p>}
          </>
        )}
      </div>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove Value"
        size="md"
        footer={
          removeError ? (
            <Button variant="muted" className="flex-1" onClick={() => setRemoving(null)}>Close</Button>
          ) : (
            <>
              <Button variant="danger" className="flex-1" loading={removePending} onClick={confirmRemove}>Remove</Button>
              <Button variant="muted" onClick={() => setRemoving(null)}>Cancel</Button>
            </>
          )
        }
      >
        {removeError ? (
          <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">{removeError}</div>
        ) : (
          <p className="text-gray-700">
            Remove <span className="font-semibold">“{removing?.value}”</span> from {option.name}?
          </p>
        )}
      </Modal>
    </Card>
  );
}

const OPTION_FIELDS = ["name", "type", "status"] as const;

function OptionModal({ option, onClose }: { option: ProductOption; onClose: () => void }) {
  const [form, setForm] = useState<OptionInput>({ name: option.name, type: option.type, status: option.status });
  const [errors, setErrors] = useState<Errors>({});
  const save = useCatalogMutation((body: OptionInput) => catalogApi.options.update(option.id, body), {
    success: (o) => `${o.name} updated`,
    onSuccess: onClose,
    setErrors,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Option Set"
      size="md"
      footer={
        <>
          <Button type="submit" form="option-form" className="flex-1" loading={save.isPending} disabled={!form.name.trim()}>
            Update Option Set
          </Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <form
        id="option-form"
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          save.mutate({ ...form, name: form.name.trim() });
        }}
      >
        <FormErrors errors={errors} fields={OPTION_FIELDS} />
        <Field label="Option Name" required htmlFor="opt-edit-name" error={errors.name}>
          <Input id="opt-edit-name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Type" htmlFor="opt-edit-type" error={errors.type}>
          <Select id="opt-edit-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as OptionType })}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Status" htmlFor="opt-edit-status" error={errors.status}>
          <Select id="opt-edit-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OptionInput["status"] })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

