"use client";

import { useQuery } from "@tanstack/react-query";
import { Edit, Plus, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { catalogApi, catalogKeys, type Category, type CategoryInput } from "@/lib/api/services/catalog";

import { DeleteDialog, FormErrors, IconSwitch, useCatalogAccess, useCatalogMutation, type Errors } from "./shared";

const FIELDS = ["name", "parent", "description", "is_active"] as const;

export function CategoriesSection() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.categories, queryFn: ({ signal }) => catalogApi.categories.list(signal) });
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [newParent, setNewParent] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const topLevel = all.filter((c) => c.parent === null);
  const childrenOf = (id: number) => all.filter((c) => c.parent === id);

  const openNew = (parent: number | null = null) => {
    setNewParent(parent);
    setEditing("new");
  };

  if (list.isError && !list.data) return <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />;

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Product Categories</h2>
      {list.isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : topLevel.length === 0 && !canEdit ? (
        <EmptyState bare icon={Tag} title="No categories yet" description="Categories organise products in the store." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topLevel.map((category) => {
            const subs = childrenOf(category.id);
            return (
              <div key={category.id} className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                      <span className="truncate">{category.name}</span>
                      {!category.is_active && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {category.products_count} product{category.products_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditing(category)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        aria-label={`Edit ${category.name}`}
                        title="Edit category"
                      >
                        <Edit className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(category)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        aria-label={`Delete ${category.name}`}
                        title="Delete category"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
                {(subs.length > 0 || canEdit) && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {subs.map((sub) =>
                      canEdit ? (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setEditing(sub)}
                          title={`Edit ${sub.name} (${sub.products_count} products)`}
                          className={`text-xs px-2.5 py-1 rounded-full transition-colors hover:bg-blue-100 hover:text-blue-700 ${sub.is_active ? "bg-gray-100 text-gray-700" : "bg-gray-50 text-gray-400 line-through"}`}
                        >
                          {sub.name} <span className="text-gray-400">· {sub.products_count}</span>
                        </button>
                      ) : (
                        <span key={sub.id} className={`text-xs px-2.5 py-1 rounded-full ${sub.is_active ? "bg-gray-100 text-gray-700" : "bg-gray-50 text-gray-400 line-through"}`}>
                          {sub.name} <span className="text-gray-400">· {sub.products_count}</span>
                        </span>
                      ),
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openNew(category.id)}
                        className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-600 transition-colors"
                      >
                        + Subcategory
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {canEdit && (
            <button
              type="button"
              onClick={() => openNew()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-24 hover:border-blue-500 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-2"
            >
              <Plus className="size-8 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">Add Category</span>
            </button>
          )}
        </div>
      )}

      {editing && (
        <CategoryModal
          category={editing === "new" ? null : editing}
          defaultParent={newParent}
          topLevel={topLevel}
          hasChildren={editing !== "new" && childrenOf(editing.id).length > 0}
          onClose={() => setEditing(null)}
        />
      )}
      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Category"
        name={deleting?.name ?? ""}
        onDelete={() => catalogApi.categories.remove(deleting!.id)}
        onDeactivate={deleting?.is_active ? () => catalogApi.categories.update(deleting.id, { is_active: false }) : undefined}
        onClose={() => setDeleting(null)}
      />
    </Card>
  );
}

function CategoryModal({
  category,
  defaultParent,
  topLevel,
  hasChildren,
  onClose,
}: {
  category: Category | null;
  defaultParent: number | null;
  topLevel: Category[];
  hasChildren: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CategoryInput>({
    name: category?.name ?? "",
    parent: category ? category.parent : defaultParent,
    description: category?.description ?? "",
    is_active: category?.is_active ?? true,
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof CategoryInput>(k: K, v: CategoryInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useCatalogMutation(
    (body: CategoryInput) => (category ? catalogApi.categories.update(category.id, body) : catalogApi.categories.create(body)),
    {
      success: (c) => (category ? `${c.name} updated` : `${c.name} added`),
      onSuccess: onClose,
      setErrors,
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    save.mutate({ ...form, name: form.name.trim() });
  };

  const parents = topLevel.filter((c) => c.id !== category?.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? "Edit Category" : form.parent ? "Add Subcategory" : "Add Category"}
      size="lg"
      footer={
        <>
          <Button type="submit" form="category-form" className="flex-1" loading={save.isPending} disabled={!form.name.trim()}>
            {category ? "Update Category" : "Add Category"}
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrors errors={errors} fields={FIELDS} />
        <Field label="Category Name" required htmlFor="cat-name" error={errors.name}>
          <Input id="cat-name" value={form.name} onChange={(e) => set("name", e.target.value)} invalid={Boolean(errors.name)} maxLength={120} autoFocus />
        </Field>
        <Field
          label="Parent Category"
          htmlFor="cat-parent"
          error={errors.parent}
          hint={hasChildren ? "This category has subcategories, so it must stay top-level." : "Leave empty for a top-level category, or choose one to make this a subcategory."}
        >
          <Select
            id="cat-parent"
            value={form.parent ?? ""}
            disabled={hasChildren}
            onChange={(e) => set("parent", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">None (top-level category)</option>
            {parents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" htmlFor="cat-desc" error={errors.description}>
          <Textarea id="cat-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="flex items-center justify-between py-2 border-t border-gray-200">
          <div>
            <p className="font-semibold text-gray-900">Active</p>
            <p className="text-sm text-gray-600">Inactive categories are hidden from the store</p>
          </div>
          <IconSwitch size="lg" checked={form.is_active} onChange={(v) => set("is_active", v)} label="Category active" />
        </div>
      </form>
    </Modal>
  );
}
