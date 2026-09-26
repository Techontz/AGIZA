"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Edit, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import { catalogApi, catalogKeys, type Brand, type BrandInput } from "@/lib/api/services/catalog";

import { DeleteDialog, FormErrors, IconSwitch, miniInput, miniLabel, useCatalogAccess, useCatalogMutation, type Errors } from "./shared";

const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGO_ACCEPT = LOGO_TYPES.join(",");

function logoError(file: File | null): string | null {
  if (file && !LOGO_TYPES.includes(file.type)) return "Logo must be a JPEG, PNG or WebP image.";
  return null;
}

function BrandLogo({ brand, className = "size-10" }: { brand: Brand; className?: string }) {
  return brand.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL, not optimisable
    <img
      src={fileSrc(`${brand.logo_url}?v=${encodeURIComponent(brand.updated_at)}`)}
      alt={`${brand.name} logo`}
      className={`${className} object-contain rounded border border-gray-100 p-1 bg-white`}
    />
  ) : (
    <div className={`${className} rounded border border-gray-100 bg-gray-50 flex items-center justify-center text-lg font-bold text-gray-400`} aria-hidden>
      {brand.name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Object URL preview of a chosen file, revoked when it changes. */
function usePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/** Create/update a brand, then upload its logo if one was chosen. */
function useSaveBrand(brand: Brand | null, opts: { onSuccess: () => void; setErrors: (e: Errors) => void }) {
  const qc = useQueryClient();
  return useCatalogMutation(
    async ({ body, logo }: { body: BrandInput; logo: File | null }) => {
      const saved = brand ? await catalogApi.brands.update(brand.id, body) : await catalogApi.brands.create(body);
      if (!logo) return saved;
      try {
        return await catalogApi.brands.uploadLogo(saved.id, logo);
      } catch (err) {
        qc.invalidateQueries({ queryKey: catalogKeys.all });
        toast.error(`${saved.name} was saved, but the logo upload failed: ${errorText(err)}`);
        return saved;
      }
    },
    { success: (b) => (brand ? `${b.name} updated` : `${b.name} added`), onSuccess: opts.onSuccess, setErrors: opts.setErrors },
  );
}

export function BrandsSection() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.brands, queryFn: ({ signal }) => catalogApi.brands.list(signal) });
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState<Brand | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearLogo = () => {
    setLogo(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const create = useSaveBrand(null, {
    onSuccess: () => {
      setName("");
      setCountry("");
      clearLogo();
    },
    setErrors,
  });
  const toggle = useCatalogMutation((b: Brand) => catalogApi.brands.update(b.id, { status: b.status === "active" ? "inactive" : "active" }), {
    success: (b) => `${b.name} is now ${b.status}`,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const le = logoError(logo);
    if (le) return setErrors({ file: le });
    setErrors({});
    create.mutate({ body: { name: name.trim(), country: country.trim(), description: "", status: "active" }, logo });
  };

  const brands = list.data ?? [];

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card className="p-6 shadow-none">
          <h2 className="text-base font-bold text-gray-900 mb-4">Add New Brand</h2>
          <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="brand-name" className={miniLabel}>Brand Name *</label>
              <input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sony, Puma" maxLength={120}
                aria-invalid={Boolean(errors.name) || undefined} className={`${miniInput} w-40`} />
            </div>
            <div>
              <label htmlFor="brand-country" className={miniLabel}>Country of Origin</label>
              <input id="brand-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Japan" maxLength={80} className={`${miniInput} w-36`} />
            </div>
            <div>
              <label htmlFor="brand-logo" className={miniLabel}>Logo (optional)</label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  id="brand-logo"
                  type="file"
                  accept={LOGO_ACCEPT}
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                  className="w-56 text-sm text-gray-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:text-sm file:font-medium hover:file:bg-gray-200"
                />
                {logo && (
                  <button type="button" onClick={clearLogo} className="p-1 text-gray-400 hover:text-red-500" aria-label="Remove chosen logo">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="size-4 inline mr-1.5" />
              {create.isPending ? "Adding…" : "Add Brand"}
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
            <Card key={i} className="p-5 shadow-none space-y-3">
              <div className="flex items-center gap-3"><Skeleton className="size-10" /><Skeleton className="h-5 w-28" /></div>
              <Skeleton className="h-4 w-full" />
            </Card>
          ))}
        </div>
      ) : brands.length === 0 ? (
        <EmptyState icon={DollarSign} title="No brands yet" description="Add the brands your products are sold under." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map((brand) => {
            const active = brand.status === "active";
            return (
              <div key={brand.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BrandLogo brand={brand} />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{brand.name}</p>
                      {brand.country && <p className="text-xs text-gray-400">{brand.country}</p>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <IconSwitch
                        checked={active}
                        onChange={() => toggle.mutate(brand)}
                        disabled={toggle.isPending && toggle.variables?.id === brand.id}
                        label={`${brand.name} active`}
                      />
                      <button type="button" onClick={() => setEditing(brand)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit brand" aria-label={`Edit ${brand.name}`}>
                        <Edit className="size-4" />
                      </button>
                      <button type="button" onClick={() => setDeleting(brand)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete brand" aria-label={`Delete ${brand.name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">
                    {brand.products_count} product{brand.products_count !== 1 ? "s" : ""}
                  </span>
                  <span className={`font-medium px-2 py-0.5 rounded-full ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <BrandModal brand={editing} onClose={() => setEditing(null)} />}
      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Brand"
        name={deleting?.name ?? ""}
        onDelete={() => catalogApi.brands.remove(deleting!.id)}
        onDeactivate={deleting?.status === "active" ? () => catalogApi.brands.update(deleting.id, { status: "inactive" }) : undefined}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

const BRAND_FIELDS = ["name", "country", "description", "status", "file"] as const;

function BrandModal({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const [form, setForm] = useState<BrandInput>({ name: brand.name, country: brand.country, description: brand.description, status: brand.status });
  const [logo, setLogo] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const preview = usePreview(logo);
  const save = useSaveBrand(brand, { onSuccess: onClose, setErrors });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const le = logoError(logo);
    if (le) return setErrors({ file: le });
    setErrors({});
    save.mutate({ body: { ...form, name: form.name.trim(), country: form.country.trim() }, logo });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Brand"
      size="lg"
      footer={
        <>
          <Button type="submit" form="brand-form" className="flex-1" loading={save.isPending} disabled={!form.name.trim()}>
            Update Brand
          </Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <form id="brand-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrors errors={errors} fields={BRAND_FIELDS} />
        <div className="flex items-center gap-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview (object URL)
            <img src={preview} alt="New logo preview" className="size-16 object-contain rounded border border-gray-100 p-1 bg-white" />
          ) : (
            <BrandLogo brand={brand} className="size-16" />
          )}
          <div className="flex-1">
            <label htmlFor="brand-edit-logo" className="inline-flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors">
              <ImagePlus className="size-4" />
              {brand.logo_url ? "Replace Logo" : "Upload Logo"}
            </label>
            <input id="brand-edit-logo" type="file" accept={LOGO_ACCEPT} className="sr-only" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
            <p className={`text-xs mt-1 ${errors.file ? "text-red-600" : "text-gray-500"}`}>{errors.file ?? (logo ? logo.name : "JPEG, PNG or WebP")}</p>
          </div>
        </div>
        <Field label="Brand Name" required htmlFor="brand-edit-name" error={errors.name}>
          <Input id="brand-edit-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={Boolean(errors.name)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Country of Origin" htmlFor="brand-edit-country" error={errors.country}>
            <Input id="brand-edit-country" value={form.country} maxLength={80} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </Field>
          <Field label="Status" htmlFor="brand-edit-status" error={errors.status}>
            <Select id="brand-edit-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BrandInput["status"] })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <Field label="Description" htmlFor="brand-edit-desc" error={errors.description}>
          <Textarea id="brand-edit-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
