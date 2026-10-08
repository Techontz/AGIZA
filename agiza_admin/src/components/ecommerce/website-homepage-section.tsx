"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Edit, LayoutTemplate, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  catalogApi,
  catalogKeys,
  type Category,
  type HomeSection,
  type HomeSectionInput,
  type HomeSectionKind,
  type HomeSectionSource,
} from "@/lib/api/services/catalog";
import { productKeys, productsApi } from "@/lib/api/services/products";

import { DeleteDialog, FormErrors, IconSwitch, useCatalogAccess, useCatalogMutation, type Errors } from "./shared";

/* ------------------------------------------------------------------ options */

const KINDS: { value: HomeSectionKind; label: string; hint: string; defaultTitle: string }[] = [
  { value: "banners", label: "Banners", hint: "The banner slider (website or both banners from Settings)", defaultTitle: "Banners" },
  { value: "products", label: "Product row", hint: "A row of products: hand-picked, featured, deals, popular, newest or one category", defaultTitle: "Products" },
  { value: "categories", label: "Top categories", hint: "Category tiles customers can open", defaultTitle: "Top categories" },
  { value: "category_rows", label: "A row per category", hint: "One product row for each main category", defaultTitle: "Shop by category" },
  { value: "services", label: "AGIZA services", hint: "Buy for me, Deliver for me, Stores", defaultTitle: "AGIZA services" },
  { value: "stores", label: "Stores", hint: "A row of marketplace stores", defaultTitle: "Stores" },
];
const kindInfo = (k: HomeSectionKind) => KINDS.find((x) => x.value === k) ?? KINDS[0];

const SOURCES: { value: Exclude<HomeSectionSource, "">; label: string }[] = [
  { value: "manual", label: "Hand-picked products" },
  { value: "featured", label: "Featured products" },
  { value: "deals", label: "Ofa kali deals" },
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "category", label: "A category" },
];

const DEFAULT_LIMIT: Record<HomeSectionKind, number> = {
  banners: 12,
  products: 12,
  categories: 12,
  category_rows: 4,
  services: 12,
  stores: 8,
};
const maxLimit = (k: HomeSectionKind) => (k === "category_rows" ? 8 : 48);
const hasLimit = (k: HomeSectionKind) => k === "products" || k === "categories" || k === "category_rows" || k === "stores";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function sectionTitle(s: HomeSection): string {
  if (s.title) return s.title;
  if (s.kind === "products" && s.source_display) return s.source_display;
  return kindInfo(s.kind).defaultTitle;
}

function Summary({ s }: { s: HomeSection }) {
  switch (s.kind) {
    case "banners":
      return (
        <>
          Banners: managed in{" "}
          <Link href="/settings" className="text-blue-600 hover:text-blue-800 font-medium">
            Settings → Home Banners
          </Link>{" "}
          (website / both)
        </>
      );
    case "products": {
      const topUp = s.fill_with_newest ? ", topped up with newest" : "";
      if (s.source === "manual") return <>Hand-picked: {plural(s.products.length, "product")}{topUp}</>;
      if (s.source === "category") return <>Category: {s.category_name ?? "—"}, up to {s.limit}{topUp}</>;
      return <>{s.source_display || "No source chosen"}, up to {s.limit}{topUp}</>;
    }
    case "categories":
      return s.categories_detail.length ? (
        <>Categories: {s.categories_detail.map((c) => c.name).join(", ")}</>
      ) : (
        <>Main categories, up to {s.limit}</>
      );
    case "category_rows":
      return <>One row per main category, up to {plural(s.limit, "row")}</>;
    case "services":
      return <>Buy for me, Deliver for me, Stores</>;
    case "stores":
      return <>Up to {plural(s.limit, "store")}</>;
  }
}

/* ------------------------------------------------------------------ section */

/** The customer website's home page, block by block (top to bottom). */
export function WebsiteHomepageSection() {
  const { canEdit } = useCatalogAccess();
  const list = useQuery({ queryKey: catalogKeys.homeSections, queryFn: ({ signal }) => catalogApi.homeSections.list(signal) });
  const [dialog, setDialog] = useState<{ section: HomeSection | null } | null>(null);
  const [deleting, setDeleting] = useState<HomeSection | null>(null);

  const toggle = useCatalogMutation((s: HomeSection) => catalogApi.homeSections.update(s.id, { is_active: !s.is_active }), {
    success: (s) => `${sectionTitle(s)} is now ${s.is_active ? "shown" : "hidden"}`,
  });
  const reorder = useCatalogMutation((ids: number[]) => catalogApi.homeSections.reorder(ids), { success: "Order saved" });

  const sections = list.data ?? [];

  const move = (index: number, delta: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-600">What customers see on the website&apos;s home page, top to bottom.</p>
        {canEdit && (
          <Button onClick={() => setDialog({ section: null })}>
            <Plus className="size-4" />
            Add section
          </Button>
        )}
      </div>

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No sections yet" description="Add banners, product rows and categories to build the website's home page." />
      ) : (
        <ol className="space-y-3">
          {sections.map((s, i) => (
            <li
              key={s.id}
              className={`bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:shadow-sm transition-shadow ${s.is_active ? "" : "opacity-70"}`}
            >
              <div className="flex items-start gap-4 min-w-0">
                <span className="flex-shrink-0 size-8 rounded-full bg-fuchsia-100 text-fuchsia-700 text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{kindInfo(s.kind).label}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {s.is_active ? "Shown" : "Hidden"}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 truncate">{sectionTitle(s)}</p>
                  <p className="text-sm text-gray-600">
                    <Summary s={s} />
                  </p>
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 flex-shrink-0 self-end sm:self-auto">
                  <IconSwitch
                    checked={s.is_active}
                    onChange={() => toggle.mutate(s)}
                    disabled={toggle.isPending && toggle.variables?.id === s.id}
                    label={`${sectionTitle(s)} shown`}
                  />
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || reorder.isPending}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                    aria-label={`Move ${sectionTitle(s)} up`}
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === sections.length - 1 || reorder.isPending}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                    aria-label={`Move ${sectionTitle(s)} down`}
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog({ section: s })}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit section"
                    aria-label={`Edit ${sectionTitle(s)}`}
                  >
                    <Edit className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(s)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete section"
                    aria-label={`Delete ${sectionTitle(s)}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Tip:</strong> Hidden sections stay here but aren&apos;t shown on the website. Website banners are the ones set to
        &quot;Website&quot; or &quot;App and website&quot; under Settings → Home Banners.
      </div>

      {dialog && (
        <SectionDialog
          section={dialog.section}
          nextSortOrder={sections.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1}
          onClose={() => setDialog(null)}
        />
      )}
      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Section"
        name={deleting ? sectionTitle(deleting) : ""}
        onDelete={() => catalogApi.homeSections.remove(deleting!.id)}
        onDeactivate={deleting?.is_active ? () => catalogApi.homeSections.update(deleting.id, { is_active: false }) : undefined}
        deactivateLabel="Hide Instead"
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

export interface PickedProduct {
  id: number;
  name: string;
  sku: string;
  status?: string;
}

interface FormState {
  kind: HomeSectionKind;
  title: string;
  source: HomeSectionSource;
  category: number | null;
  fill_with_newest: boolean;
  limit: number;
  products: PickedProduct[];
  category_ids: number[];
}

const FORM_FIELDS = ["kind", "title", "source", "category", "fill_with_newest", "limit", "product_ids", "category_ids"] as const;

function initialForm(s: HomeSection | null): FormState {
  if (!s) {
    return { kind: "products", title: "", source: "manual", category: null, fill_with_newest: false, limit: DEFAULT_LIMIT.products, products: [], category_ids: [] };
  }
  return {
    kind: s.kind,
    title: s.title,
    source: s.source || (s.kind === "products" ? "manual" : ""),
    category: s.category,
    fill_with_newest: s.fill_with_newest,
    limit: s.limit,
    products: s.products,
    category_ids: s.category_ids,
  };
}

function SectionDialog({ section, nextSortOrder, onClose }: { section: HomeSection | null; nextSortOrder: number; onClose: () => void }) {
  const [form, setForm] = useState<FormState>(() => initialForm(section));
  const [errors, setErrors] = useState<Errors>({});
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const needsCategories = form.kind === "categories" || (form.kind === "products" && form.source === "category");
  const categories = useQuery({
    queryKey: catalogKeys.categories,
    queryFn: ({ signal }) => catalogApi.categories.list(signal),
    enabled: needsCategories,
    staleTime: 5 * 60_000,
  });

  const save = useCatalogMutation(
    (body: Partial<HomeSectionInput> & { kind: HomeSectionKind }) =>
      section ? catalogApi.homeSections.update(section.id, body) : catalogApi.homeSections.create(body),
    { success: (s) => `${sectionTitle(s)} ${section ? "updated" : "added"}`, onSuccess: onClose, setErrors },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const k = form.kind;
    const fe: Errors = {};
    if (k === "products") {
      if (!form.source) fe.source = "Choose where this row's products come from.";
      if (form.source === "category" && !form.category) fe.category = "Choose the category.";
      if (form.source === "manual" && form.products.length === 0) fe.product_ids = "Pick at least one product.";
    }
    if (hasLimit(k) && !(form.limit >= 1 && form.limit <= maxLimit(k))) fe.limit = `Enter a number from 1 to ${maxLimit(k)}.`;
    if (Object.keys(fe).length) return setErrors(fe);
    setErrors({});

    const body: Partial<HomeSectionInput> & { kind: HomeSectionKind } = { kind: k, title: form.title.trim() };
    if (k === "products") {
      body.source = form.source;
      body.category = form.source === "category" ? form.category : null;
      body.fill_with_newest = form.fill_with_newest;
      body.limit = form.limit;
      body.product_ids = form.source === "manual" ? form.products.map((p) => p.id) : [];
    } else {
      body.source = "";
      body.category = null;
    }
    if (k === "categories") body.category_ids = form.category_ids;
    if (k === "categories" || k === "category_rows" || k === "stores") body.limit = form.limit;
    if (!section) {
      body.is_active = true;
      body.sort_order = nextSortOrder;
    }
    save.mutate(body);
  };

  const k = form.kind;
  const info = kindInfo(k);

  return (
    <Modal
      open
      onClose={onClose}
      title={section ? "Edit Section" : "Add Section"}
      size="2xl"
      footer={
        <>
          <Button type="submit" form="home-section-form" className="flex-1" loading={save.isPending}>
            {section ? "Save Section" : "Add Section"}
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="home-section-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrors errors={errors} fields={FORM_FIELDS} />

        {section ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{info.label}</p>
            <p className="text-xs text-gray-500">{info.hint}</p>
          </div>
        ) : (
          <Field label="Kind of section" required htmlFor="hs-kind" error={errors.kind} hint={info.hint}>
            <Select
              id="hs-kind"
              value={k}
              onChange={(e) => {
                const kind = e.target.value as HomeSectionKind;
                setErrors({});
                set({ kind, limit: DEFAULT_LIMIT[kind], source: kind === "products" ? form.source || "manual" : "" });
              }}
            >
              {KINDS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Title" htmlFor="hs-title" error={errors.title} hint={`Optional. Empty shows "${k === "products" ? SOURCES.find((s) => s.value === form.source)?.label ?? info.defaultTitle : info.defaultTitle}".`}>
          <Input id="hs-title" value={form.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} invalid={Boolean(errors.title)} />
        </Field>

        {k === "products" && (
          <>
            <Field label="Products come from" required htmlFor="hs-source" error={errors.source}>
              <Select id="hs-source" value={form.source} onChange={(e) => set({ source: e.target.value as HomeSectionSource })}>
                {SOURCES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            {form.source === "category" && (
              <Field label="Category" required htmlFor="hs-category" error={errors.category}>
                <Select
                  id="hs-category"
                  value={form.category ?? ""}
                  onChange={(e) => set({ category: e.target.value ? Number(e.target.value) : null })}
                  disabled={categories.isPending}
                >
                  <option value="">{categories.isPending ? "Loading…" : "Choose a category"}</option>
                  {sortCategories(categories.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent_name ? `${c.parent_name} › ${c.name}` : c.name}
                      {c.is_active ? "" : " (inactive)"}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {form.source === "manual" && (
              <Field label="Products" required error={errors.product_ids}>
                <OrderedProductPicker value={form.products} onChange={(products) => set({ products })} />
              </Field>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.fill_with_newest}
                onChange={(e) => set({ fill_with_newest: e.target.checked })}
                className="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Top up with newest products if too few
            </label>
            {errors.fill_with_newest && <p className="text-xs text-red-600">{errors.fill_with_newest}</p>}
          </>
        )}

        {k === "categories" && (
          <Field label="Categories" error={errors.category_ids} hint="None ticked shows the main categories.">
            {categories.isPending ? (
              <Skeleton className="h-24" />
            ) : categories.isError ? (
              <p className="text-sm text-red-600">Couldn&apos;t load categories.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
                {sortCategories(categories.data ?? []).map((c) => {
                  const checked = form.category_ids.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          set({ category_ids: checked ? form.category_ids.filter((id) => id !== c.id) : [...form.category_ids, c.id] })
                        }
                        className="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={c.parent ? "pl-4" : "font-medium"}>{c.name}</span>
                      {!c.is_active && <span className="text-xs text-gray-400">(inactive)</span>}
                    </label>
                  );
                })}
              </div>
            )}
            {form.category_ids.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">{plural(form.category_ids.length, "category")} chosen</p>
            )}
          </Field>
        )}

        {hasLimit(k) && (
          <Field
            label={k === "category_rows" ? "Number of rows" : k === "stores" ? "How many stores to show" : k === "categories" ? "How many categories to show" : "How many to show"}
            required
            htmlFor="hs-limit"
            error={errors.limit}
            hint={`1 to ${maxLimit(k)}`}
          >
            <Input
              id="hs-limit"
              type="number"
              min={1}
              max={maxLimit(k)}
              value={Number.isNaN(form.limit) ? "" : form.limit}
              onChange={(e) => set({ limit: e.target.valueAsNumber })}
              invalid={Boolean(errors.limit)}
              className="max-w-32"
            />
          </Field>
        )}

        {k === "banners" && (
          <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            The banners themselves are managed in{" "}
            <Link href="/settings" className="text-blue-600 hover:text-blue-800 font-medium">
              Settings → Home Banners
            </Link>
            : set a banner to &quot;Website&quot; or &quot;App and website&quot; to show it here.
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Main categories first, each followed by its sub-categories. */
function sortCategories(list: Category[]): Category[] {
  const byName = (a: Category, b: Category) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  const roots = list.filter((c) => c.parent === null).sort(byName);
  const out: Category[] = [];
  const seen = new Set<number>();
  for (const r of roots) {
    out.push(r);
    seen.add(r.id);
    for (const child of list.filter((c) => c.parent === r.id).sort(byName)) {
      out.push(child);
      seen.add(child.id);
    }
  }
  return [...out, ...list.filter((c) => !seen.has(c.id)).sort(byName)];
}

/* ------------------------------------------------------------------ product picker */

/** Hand-picked products in display order, with search (catalog/products?search=) to add more. */
export function OrderedProductPicker({
  value,
  onChange,
  max = 48,
}: {
  value: PickedProduct[];
  onChange: (next: PickedProduct[]) => void;
  max?: number;
}) {
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term.trim(), 300);
  const results = useQuery({
    queryKey: productKeys.search(debounced),
    queryFn: ({ signal }) => productsApi.search(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const chosen = new Set(value.map((p) => p.id));
  const options = (results.data ?? []).filter((p) => !chosen.has(p.id));
  const full = value.length >= max;

  const move = (i: number, delta: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {value.length > 0 ? (
        <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {value.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-semibold text-gray-400 w-5 text-right">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 font-mono">
                    {p.sku}
                    {p.status && p.status !== "active" && <span className="ml-2 font-sans text-amber-600">({p.status.replace(/_/g, " ")})</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Move ${p.name} up`}
                  title="Move up"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Move ${p.name} down`}
                  title="Move down"
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x.id !== p.id))}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  aria-label={`Remove ${p.name}`}
                  title="Remove"
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-500">No products picked yet.</p>
      )}

      {full ? (
        <p className="text-xs text-gray-500">{max} products is the most this list can hold.</p>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-gray-400" />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            aria-label="Search products to add"
            placeholder="Search products by name or SKU to add…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {debounced.length >= 2 && (
            <div className="mt-1 border border-gray-200 rounded-lg bg-white shadow-sm max-h-56 overflow-y-auto">
              {results.isFetching && !results.data ? (
                <p className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" /> Searching…
                </p>
              ) : results.isError ? (
                <p className="px-3 py-2 text-xs text-red-600">Couldn&apos;t search products.</p>
              ) : options.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No matching products.</p>
              ) : (
                options.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChange([...value, { id: p.id, name: p.name, sku: p.sku, status: p.status }])}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-800 truncate">{p.name}</span>
                      <span className="block text-xs text-gray-400 font-mono">
                        {p.sku}
                        {p.status !== "active" && <span className="ml-2 font-sans text-amber-600">({p.status_display})</span>}
                      </span>
                    </span>
                    <span className="text-xs text-blue-600 font-semibold whitespace-nowrap flex items-center gap-1">
                      <Plus className="size-3.5" /> Add
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
