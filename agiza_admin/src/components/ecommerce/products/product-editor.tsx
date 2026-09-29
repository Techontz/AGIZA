"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Info, Plus, Ship, Store, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { can, useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import {
  CONDITIONS,
  LOOKUP_STALE,
  PRODUCT_STATUSES,
  STOCK_OVERRIDES,
  TAX_CATEGORIES,
  productKeys,
  productLookups,
  productsApi,
  type Condition,
  type LabelColor,
  type ProductDetail,
  type ProductStatus,
  type ProfitType,
  type StockOverride,
  type TaxCategory,
  type WarehouseOption,
} from "@/lib/api/services/products";
import { cn } from "@/lib/cn";
import { formatTSh } from "@/lib/format";

import { ReviewStatusBadge } from "../marketplace-ui";

import { DeliveryEstimator } from "./delivery-estimator";
import { Chip, EditorDialog, FI, FS, FTA, SecHead, SI, YesNo } from "./editor-ui";
import { emptyForm, formFromDetail, measures, sentVariants, toPayload, type ProductForm, type VariantForm } from "./form-model";
import { ImagesMedia, uploadAll, type QueuedImage } from "./images-media";
import { ProductModerationButtons } from "./product-moderation";
import { ProductPicker } from "./product-picker";
import { VariationModal } from "./variation-modal";

export const LABEL_COLORS: Record<LabelColor, string> = {
  blue: "bg-blue-500 text-white border-blue-500",
  red: "bg-red-500 text-white border-red-500",
  yellow: "bg-yellow-400 text-gray-900 border-yellow-400",
  purple: "bg-purple-500 text-white border-purple-500",
  orange: "bg-orange-500 text-white border-orange-500",
  green: "bg-green-500 text-white border-green-500",
  gray: "bg-gray-500 text-white border-gray-500",
};

const SENSITIVE_HANDLING = ["contains_battery", "hazardous", "restricted", "electronics", "fragile"];

const TYPE_PLURAL: Record<WarehouseOption["type"], string> = {
  fulfillment: "Fulfillment Centers",
  pickup_point: "Pickup Points",
  shop: "Shop Locations",
  consolidation: "Consolidation Hubs",
};
const TYPE_ORDER: WarehouseOption["type"][] = ["fulfillment", "pickup_point", "shop", "consolidation"];

/** Warehouses grouped like the design's optgroups (Tanzania first, then international). */
function groupWarehouses(list: WarehouseOption[], homeCountry: number | null, keepId: string) {
  const usable = list.filter((w) => w.status !== "inactive" || String(w.id) === keepId);
  const groups: { label: string; items: WarehouseOption[] }[] = [];
  for (const home of [true, false]) {
    for (const type of TYPE_ORDER) {
      const items = usable.filter((w) => (w.country === homeCountry) === home && w.type === type);
      if (items.length) groups.push({ label: `${home ? "Tanzania" : "International"} — ${TYPE_PLURAL[type]}`, items });
    }
  }
  return groups;
}

function omit<T>(obj: Record<string, T>, ...keys: string[]): Record<string, T> {
  const next = { ...obj };
  for (const k of keys) delete next[k];
  return next;
}

/* ====================================================================== */

/** Add / Edit Product. `productId` null = new product. */
export function ProductEditor({ productId, onClose }: { productId: number | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: productKeys.detail(productId ?? 0),
    queryFn: () => productsApi.get(productId as number),
    enabled: productId !== null,
  });

  if (productId !== null && !detail.data) {
    return (
      <EditorDialog
        onClose={onClose}
        title="Edit Product"
        footer={
          <Button variant="secondary" className="ml-auto px-6 py-2.5 text-sm" onClick={onClose}>
            Close
          </Button>
        }
      >
        {detail.isError ? (
          <ErrorState bare message={errorText(detail.error)} onRetry={() => detail.refetch()} />
        ) : (
          <div className="p-6 space-y-4" aria-busy="true" aria-label="Loading product">
            <div className="flex gap-4">
              <Skeleton className="size-28 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="size-14 rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ))}
          </div>
        )}
      </EditorDialog>
    );
  }

  return <EditorForm key={detail.data?.id ?? "new"} product={detail.data ?? null} onClose={onClose} />;
}

/* ====================================================================== */

function EditorForm({ product, onClose }: { product: ProductDetail | null; onClose: () => void }) {
  const uid = useId();
  const qc = useQueryClient();
  const me = useMe();
  const canEdit = can(me.data, "ecommerce", "edit");
  const isNew = product === null;
  const bodyRef = useRef<HTMLDivElement>(null);

  const [initial] = useState<ProductForm>(() => (product ? formFromDetail(product) : emptyForm()));
  const [form, setForm] = useState<ProductForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [variantErrors, setVariantErrors] = useState<Record<string, Record<string, string>>>({});
  const [queued, setQueued] = useState<QueuedImage[]>([]);
  const [primaryKey, setPrimaryKey] = useState<string | null>(null);
  const [variantQueue, setVariantQueue] = useState<Record<string, QueuedImage[]>>({});
  const [variationOpen, setVariationOpen] = useState<{ editing: VariantForm | null } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  /* ---- lookups ---- */
  const opts = { staleTime: LOOKUP_STALE };
  const categories = useQuery({ queryKey: productKeys.lookup("categories"), queryFn: productLookups.categories, ...opts });
  const brands = useQuery({ queryKey: productKeys.lookup("brands"), queryFn: productLookups.brands, ...opts });
  const labels = useQuery({ queryKey: productKeys.lookup("labels"), queryFn: productLookups.labels, ...opts });
  const optionSets = useQuery({ queryKey: productKeys.lookup("options"), queryFn: productLookups.options, ...opts });
  const vendors = useQuery({ queryKey: productKeys.lookup("vendors"), queryFn: productLookups.vendors, ...opts });
  const profiles = useQuery({ queryKey: productKeys.lookup("profiles"), queryFn: productLookups.profiles, ...opts });
  const methods = useQuery({ queryKey: productKeys.lookup("methods"), queryFn: productLookups.methods, ...opts });
  const warehouses = useQuery({ queryKey: productKeys.lookup("warehouses"), queryFn: productLookups.warehouses, ...opts });
  const countries = useQuery({ queryKey: productKeys.lookup("countries"), queryFn: productLookups.countries, ...opts });
  const engineSettings = useQuery({
    queryKey: productKeys.lookup("engine-settings"),
    queryFn: productLookups.engineSettings,
    enabled: can(me.data, "shipping_engine", "view"),
    retry: false,
    ...opts,
  });
  const divisor = engineSettings.data?.default_volumetric_divisor ?? 5000;

  // Release local previews when the editor goes away.
  const previews = useRef<QueuedImage[]>([]);
  previews.current = [...queued, ...Object.values(variantQueue).flat()];
  useEffect(() => () => previews.current.forEach((q) => URL.revokeObjectURL(q.preview)), []);

  /* ---- derived ---- */
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as string]) setErrors((e) => omit(e, key as string));
  };
  const toggleId = (key: "shipping_methods" | "variation_options" | "labels", id: number) =>
    set(key, form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id]);

  const topCategories = (categories.data ?? []).filter((c) => c.parent === null && (c.is_active || String(c.id) === form.category));
  const subcategories = (categories.data ?? []).filter(
    (c) => form.category !== "" && c.parent === Number(form.category) && (c.is_active || String(c.id) === form.subcategory),
  );
  const homeCountry = countries.data?.find((c) => c.iso2 === "TZ")?.id ?? null;
  const warehouseGroups = groupWarehouses(warehouses.data ?? [], homeCountry, form.location);
  const warehouse = warehouses.data?.find((w) => String(w.id) === form.location) ?? null;
  const profile = profiles.data?.find((p) => String(p.id) === form.shipping_profile) ?? null;
  const vendor = vendors.data?.find((v) => String(v.id) === form.vendor) ?? null;
  const selectedSets = (optionSets.data ?? []).filter((o) => form.variation_options.includes(o.id));
  const m = measures(form.length_cm, form.width_cm, form.height_cm, divisor);

  const variantStock = form.variants.filter((v) => v.status !== "inactive").reduce((n, v) => n + (Number(v.stock) || 0), 0);
  const stockNumber = form.has_variations ? variantStock : Number(form.stock) || 0;
  const threshold = Number(form.low_stock_threshold) || 0;
  const stockStatus = stockNumber <= 0 ? "Out of Stock" : stockNumber <= threshold ? "Low Stock" : "In Stock";

  const locationValue = form.location_kind === "warehouse" ? (form.location ? `w:${form.location}` : "") : form.location_kind;
  const originCountryName = countries.data?.find((c) => String(c.id) === form.origin_country)?.display_name;
  const originLabel =
    form.location_kind === "warehouse" && warehouse
      ? `${warehouse.city_name}, ${warehouse.country_name}`
      : originCountryName ?? (form.location_kind === "transit" ? "In Transit" : "Vendor Location");
  const chosenMethods = (methods.data ?? []).filter((x) => form.shipping_methods.includes(x.id));
  const onlySea = chosenMethods.length > 0 && chosenMethods.every((x) => x.category === "sea");
  const sensitive = (profile?.handling ?? []).some((h) => SENSITIVE_HANDLING.includes(h));

  const dirty =
    JSON.stringify(form) !== JSON.stringify(initial) || queued.length > 0 || Object.values(variantQueue).some((q) => q.length > 0);

  /* ---- validation (mirrors the backend so errors show before a round trip) ---- */
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter the product name.";
    if (!form.sku.trim()) e.sku = "Enter a SKU.";
    if (!form.category) e.category = "Choose a category.";
    if (form.price.trim() === "") e.price = "Enter the price.";
    else if (Number(form.price) < 0) e.price = "The price can't be negative.";
    if (form.compare_at_price.trim() !== "" && form.price.trim() !== "" && Number(form.compare_at_price) < Number(form.price)) {
      e.compare_at_price = "The compare-at price should be higher than the price.";
    }
    const inStock = form.has_variations ? form.variants.some((v) => Number(v.stock) > 0 && v.stockTouched) : Number(form.stock) > 0 && (isNew || form.stockTouched);
    if (inStock && form.location_kind === "warehouse" && !form.location) {
      e.location = "Choose the warehouse / location — required when the product is in stock.";
    }
    if (form.has_variations && sentVariants(form).length === 0) e.variants = "Add at least one variation, or set Has Variations to No.";
    return e;
  };

  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error="true"]');
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (el && "focus" in el) el.focus({ preventScroll: true });
    });

  /* ---- save ---- */
  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form, isNew);
      let detail = isNew ? await productsApi.create(payload) : await productsApi.update(product.id, payload);
      let failed = 0;
      if (queued.length) {
        const primary = queued.find((q) => q.key === primaryKey) ?? queued[0];
        const ordered = [primary, ...queued.filter((q) => q !== primary)].map((q) => q.file);
        const r = await uploadAll(detail.id, ordered);
        if (r.detail) detail = r.detail;
        failed += r.failed;
      }
      for (const [key, files] of Object.entries(variantQueue)) {
        if (!files.length) continue;
        const sku = form.variants.find((v) => v.key === key)?.sku;
        const variant = detail.variants.find((v) => v.sku === sku);
        if (!variant) continue;
        const r = await uploadAll(detail.id, files.map((q) => q.file), variant.id);
        if (r.detail) detail = r.detail;
        failed += r.failed;
      }
      return { detail, failed };
    },
    onSuccess: ({ detail, failed }) => {
      qc.setQueryData(productKeys.detail(detail.id), detail);
      qc.invalidateQueries({ queryKey: productKeys.all });
      qc.invalidateQueries({ queryKey: productKeys.lookup("categories") });
      toast.success(isNew ? `${detail.name} added` : `${detail.name} updated`);
      if (failed) toast.warning(`${failed} image${failed === 1 ? "" : "s"} couldn't be uploaded — add ${failed === 1 ? "it" : "them"} from Edit Product.`);
      previews.current.forEach((q) => URL.revokeObjectURL(q.preview));
      previews.current = [];
      onClose();
    },
    onError: (err) => {
      const fe = fieldErrors(err);
      const next: Record<string, string> = {};
      const vErr: Record<string, Record<string, string>> = {};
      const details = err instanceof ApiError && err.details && !Array.isArray(err.details) ? err.details : null;
      for (const [k, msg] of Object.entries(fe)) next[k] = msg;
      // Nested serializer errors: variants: [{}, {sku: [...]}], specifications: [...]
      const nested = details?.variants;
      if (Array.isArray(nested) && nested.some((x) => x && typeof x === "object")) {
        const rows = sentVariants(form);
        nested.forEach((row, i) => {
          if (row && typeof row === "object" && !Array.isArray(row) && rows[i]) {
            vErr[rows[i].key] = Object.fromEntries(
              Object.entries(row as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]),
            );
          }
        });
        next.variants = "Some variations need attention — open them to see what to fix.";
      }
      const specs = details?.specifications;
      if (Array.isArray(specs) && specs.some((x) => x && typeof x === "object")) next.specifications = "Each specification needs a name (max 80) and value (max 200).";
      setErrors(next);
      setVariantErrors(vErr);
      toast.error(next.variants ?? (errorText(err).replace(/\[object Object\]/g, "").trim() || "Couldn't save the product"));
      if (Object.keys(next).length) focusFirstError();
    },
  });

  const submit = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("Check the highlighted fields.");
      focusFirstError();
      return;
    }
    save.mutate();
  };

  const requestClose = () => {
    if (save.isPending) return;
    if (dirty && canEdit) setConfirmDiscard(true);
    else onClose();
  };

  /* ---- variations ---- */
  const takenSkusFor = (key: string | null) => [form.sku, ...form.variants.filter((v) => v.key !== key).map((v) => v.sku)].filter(Boolean);
  const saveVariation = (v: VariantForm, files: QueuedImage[]) => {
    setForm((f) => ({
      ...f,
      variants: f.variants.some((x) => x.key === v.key) ? f.variants.map((x) => (x.key === v.key ? v : x)) : [...f.variants, v],
    }));
    setVariantQueue((q) => ({ ...q, [v.key]: files }));
    setVariantErrors((e) => omit(e, v.key));
    if (errors.variants) setErrors((e) => omit(e, "variants"));
    setVariationOpen(null);
  };
  const removeVariation = (key: string) => {
    (variantQueue[key] ?? []).forEach((q) => URL.revokeObjectURL(q.preview));
    setVariantQueue((q) => omit(q, key));
    set("variants", form.variants.filter((x) => x.key !== key));
  };
  const variantThumb = (v: VariantForm) => {
    const saved = v.id ? product?.variants.find((x) => x.id === v.id)?.images[0] : undefined;
    if (saved) return fileSrc(saved.url);
    return variantQueue[v.key]?.[0]?.preview ?? null;
  };

  const f = (name: string) => `${uid}-${name}`;
  const lookupsLoading = categories.isPending || warehouses.isPending;
  const lookupError = [categories, brands, labels, optionSets, vendors, profiles, methods, warehouses, countries].find((q) => q.isError);

  const summary: [string, string][] = [
      ["Shipping Profile", profile?.name ?? "—"],
      ["Product Location", form.location_kind === "warehouse" ? (warehouse ? `${warehouse.city_name}, ${warehouse.country_name}` : "—") : form.location_kind === "vendor" ? "Vendor Location" : "In Transit"],
      ["Weight", form.weight_kg ? `${form.weight_kg} KG` : "—"],
      ["CBM", m.hasAll ? m.cbm : "—"],
      ["Volumetric Weight", m.hasAll ? `${m.volumetric} KG` : "—"],
      ["Available Methods", chosenMethods.map((x) => x.name).join(", ") || "—"],
  ];

  return (
    <EditorDialog
      onClose={requestClose}
      title={isNew ? "Add New Product" : "Edit Product"}
      subtitle={product ? `${product.reference} · ${product.sku}` : undefined}
      footer={
        <>
          <Button
            className="flex-1 px-6 py-2.5 text-sm"
            onClick={submit}
            loading={save.isPending}
            disabled={!canEdit || lookupsLoading}
            title={canEdit ? undefined : "You have view-only access to E-commerce"}
          >
            {save.isPending ? (isNew ? "Adding…" : "Saving…") : isNew ? "Add Product" : "Update Product"}
          </Button>
          <Button variant="secondary" className="px-6 py-2.5 text-sm" onClick={requestClose} disabled={save.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div ref={bodyRef} className="p-4 sm:p-6 space-y-1">
        {!canEdit && me.data && (
          <div className="mb-4 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
            <Info className="size-4 flex-shrink-0" /> You have view-only access to E-commerce products.
          </div>
        )}
        {product?.seller?.self_service && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-900">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Store className="size-4 flex-shrink-0" />
                <span>
                  Listed by <span className="font-semibold">{product.seller.name}</span> (self-service vendor)
                </span>
                <ReviewStatusBadge status={product.review_status} label={product.review_status_display} />
              </div>
              {product.review_note && <p className="mt-1 text-indigo-800">Review note: {product.review_note}</p>}
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-1.5">
                <ProductModerationButtons product={product} compact={false} />
              </div>
            )}
          </div>
        )}
        {lookupError && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <span>Some lists couldn&apos;t load: {errorText(lookupError.error)}</span>
            <button type="button" className="font-semibold underline" onClick={() => lookupError.refetch()}>
              Retry
            </button>
          </div>
        )}

        <fieldset disabled={!canEdit || save.isPending} className="min-w-0 border-0 p-0 m-0">
          {/* ── Images & Media ── */}
          <ImagesMedia product={product} queued={queued} onQueue={setQueued} primaryKey={primaryKey} onPrimaryKey={setPrimaryKey} disabled={!canEdit || save.isPending} />

          {/* ── 1. Basic Information ── */}
          <SecHead n={1} title="Basic Information" />
          <div className="space-y-4">
            <SI label="Product Name *" htmlFor={f("name")} error={errors.name}>
              <FI id={f("name")} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Samsung Galaxy A54 5G" maxLength={200} invalid={!!errors.name} />
            </SI>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="SKU *" htmlFor={f("sku")} error={errors.sku}>
                <FI id={f("sku")} value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="ELEC-SAM-A54" maxLength={64} invalid={!!errors.sku} />
              </SI>
              <SI label="Brand" htmlFor={f("brand")} error={errors.brand}>
                <FS id={f("brand")} value={form.brand} onChange={(e) => set("brand", e.target.value)} invalid={!!errors.brand}>
                  <option value="">{brands.isPending ? "Loading brands…" : "— No brand —"}</option>
                  {(brands.data ?? [])
                    .filter((b) => b.status === "active" || String(b.id) === form.brand)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </FS>
              </SI>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="Category *" htmlFor={f("category")} error={errors.category}>
                <FS
                  id={f("category")}
                  value={form.category}
                  invalid={!!errors.category}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, category: e.target.value, subcategory: "" }));
                    setErrors((e) => omit(e, "category", "subcategory"));
                  }}
                >
                  <option value="">{categories.isPending ? "Loading categories…" : "Select category..."}</option>
                  {topCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </FS>
              </SI>
              <SI label="Subcategory" htmlFor={f("subcategory")} error={errors.subcategory} hint={form.category && subcategories.length === 0 ? "This category has no subcategories" : undefined}>
                <FS id={f("subcategory")} value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} disabled={!form.category || subcategories.length === 0} invalid={!!errors.subcategory}>
                  <option value="">Select subcategory...</option>
                  {subcategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </FS>
              </SI>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="Status *" htmlFor={f("status")} error={errors.status}>
                <FS id={f("status")} value={form.status} onChange={(e) => set("status", e.target.value as ProductStatus)}>
                  {PRODUCT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </FS>
              </SI>
              <SI label="Product Condition *" htmlFor={f("condition")}>
                <FS id={f("condition")} value={form.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </FS>
              </SI>
            </div>
            {form.condition !== "new" && (
              <SI label="Condition Description" htmlFor={f("cond")} hint="Displayed to customers on the product page" error={errors.condition_description}>
                <FTA id={f("cond")} rows={2} value={form.condition_description} onChange={(e) => set("condition_description", e.target.value)} placeholder="e.g. Used — minor body marks, fully functional." />
              </SI>
            )}
          </div>

          {/* ── 2. Price & Inventory ── */}
          <SecHead n={2} title="Price & Inventory" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="Price (TSh) *" htmlFor={f("price")} error={errors.price}>
                <FI id={f("price")} type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="850000" invalid={!!errors.price} />
              </SI>
              <SI label="Compare-at / Original Price (TSh)" htmlFor={f("cmp")} hint="Shown as strikethrough original price" error={errors.compare_at_price}>
                <FI id={f("cmp")} type="number" min="0" step="0.01" inputMode="decimal" value={form.compare_at_price} onChange={(e) => set("compare_at_price", e.target.value)} placeholder="950000" invalid={!!errors.compare_at_price} />
              </SI>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SI
                label="Stock *"
                htmlFor={f("stock")}
                error={errors.stock}
                hint={
                  form.has_variations
                    ? "Managed per variation (section 7)"
                    : form.location_kind !== "warehouse"
                      ? "Stock is recorded at an Agiza warehouse"
                      : "On-hand quantity at the product location"
                }
              >
                <FI
                  id={f("stock")}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.has_variations ? String(variantStock) : form.stock}
                  readOnly={form.has_variations}
                  disabled={!form.has_variations && form.location_kind !== "warehouse"}
                  className={form.has_variations ? "bg-gray-50 text-gray-500" : undefined}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, stock: e.target.value, stockTouched: true }));
                    if (errors.stock) setErrors((e) => omit(e, "stock"));
                  }}
                  invalid={!!errors.stock}
                />
              </SI>
              <SI label="Low Stock Alert At" htmlFor={f("low")} error={errors.low_stock_threshold}>
                <FI id={f("low")} type="number" min="0" step="1" inputMode="numeric" value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} placeholder="e.g. 3" invalid={!!errors.low_stock_threshold} />
              </SI>
              <SI label="Stock Status" htmlFor={f("sstatus")} hint="Automatic from stock and alert level">
                <FI
                  id={f("sstatus")}
                  value={stockStatus}
                  readOnly
                  className={cn("bg-gray-50 font-medium", stockStatus === "Out of Stock" ? "text-red-600" : stockStatus === "Low Stock" ? "text-orange-600" : "text-green-700")}
                />
              </SI>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 py-1">
              <span className="text-sm font-semibold text-gray-700">Allow &quot;Pata Bei&quot; when out of stock:</span>
              <YesNo name={f("pata")} label="Allow Pata Bei when out of stock" value={form.pata_bei} onChange={(v) => set("pata_bei", v)} />
              <span className="text-xs text-gray-400">Allows out-of-stock products to remain visible for quotation requests</span>
            </div>
          </div>

          {/* ── 3. Product Location ── */}
          <SecHead n={3} title="Product Location" />
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 mb-3 text-xs text-blue-700">
            Product Location = where the product currently is. This is <strong>not</strong> the customer&apos;s delivery address. Displayed to customers as
            &quot;Inapatikana: {warehouse?.city_name ?? "Dar es Salaam"}&quot;. <strong>Required when product is In Stock.</strong>
          </div>
          <div className="space-y-3">
            <SI
              label="Warehouse / Location *"
              htmlFor={f("location")}
              error={errors.location}
              hint="Select the warehouse or shop where this product is physically stored. Required when product is In Stock."
            >
              <FS
                id={f("location")}
                value={locationValue}
                invalid={!!errors.location}
                onChange={(e) => {
                  const v = e.target.value;
                  const w = v.startsWith("w:") ? warehouses.data?.find((x) => `w:${x.id}` === v) : undefined;
                  setForm((p) => ({
                    ...p,
                    location_kind: v === "vendor" || v === "transit" ? v : "warehouse",
                    location: w ? String(w.id) : "",
                    origin_country: w ? String(w.country) : p.location_kind === "warehouse" ? "" : p.origin_country,
                  }));
                  setErrors((e) => omit(e, "location"));
                }}
              >
                <option value="">{warehouses.isPending ? "Loading locations…" : "— Select location —"}</option>
                {warehouseGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((w) => (
                      <option key={w.id} value={`w:${w.id}`}>
                        {w.code} · {w.name}
                        {w.country !== homeCountry ? ` (${w.country_name})` : ""}
                        {w.status === "full" ? " — Full" : w.status === "inactive" ? " — Inactive" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="Other">
                  <option value="vendor">Vendor Location (not Agiza warehouse)</option>
                  <option value="transit">In Transit</option>
                </optgroup>
              </FS>
            </SI>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="Shelf / Bin Code" htmlFor={f("bin")} hint="Shelf or bin position inside the warehouse (e.g. A-12-3)" error={errors.bin_code}>
                <FI id={f("bin")} value={form.bin_code} onChange={(e) => set("bin_code", e.target.value)} placeholder="e.g. A-12-3" maxLength={40} disabled={form.location_kind !== "warehouse"} />
              </SI>
              <SI label="Stock Status Override" htmlFor={f("override")}>
                <FS id={f("override")} value={form.stock_override} onChange={(e) => set("stock_override", e.target.value as StockOverride)}>
                  {STOCK_OVERRIDES.map((o) => (
                    <option key={o.value || "auto"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FS>
              </SI>
            </div>
          </div>

          {/* ── 4. Shipping Profile ── */}
          <SecHead n={4} title="Shipping Profile" />
          <div className="space-y-3">
            <SI label="Shipping Profile" htmlFor={f("profile")} error={errors.shipping_profile} hint="Defines how this product is classified for shipping and its special handling requirements">
              <FS id={f("profile")} value={form.shipping_profile} onChange={(e) => set("shipping_profile", e.target.value)}>
                <option value="">{profiles.isPending ? "Loading profiles…" : "— Select shipping profile —"}</option>
                {(profiles.data ?? [])
                  .filter((p) => p.status === "active" || String(p.id) === form.shipping_profile)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </FS>
            </SI>
            {profile && profile.handling_display.length > 0 && (
              <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5">
                <Info className="size-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-yellow-700 mb-1">Special Handling from profile:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.handling_display.map((h) => (
                      <span key={h} className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-medium">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 5. Physical & Shipping Dimensions ── */}
          <SecHead n={5} title="Physical & Shipping Dimensions" />
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(
                [
                  ["weight_kg", "Weight (KG)", "0.001"],
                  ["length_cm", "Length (CM)", "0.1"],
                  ["width_cm", "Width (CM)", "0.1"],
                  ["height_cm", "Height (CM)", "0.1"],
                ] as const
              ).map(([key, label, step]) => (
                <SI key={key} label={label} htmlFor={f(key)} error={errors[key]}>
                  <FI id={f(key)} type="number" min="0" step={step} inputMode="decimal" value={form[key]} onChange={(e) => set(key, e.target.value)} invalid={!!errors[key]} />
                </SI>
              ))}
              <SI label="Packages" htmlFor={f("packages")} error={errors.packages}>
                <FI id={f("packages")} type="number" min="1" max="999" step="1" inputMode="numeric" value={form.packages} onChange={(e) => set("packages", e.target.value)} invalid={!!errors.packages} />
              </SI>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="CBM (auto-calculated)" htmlFor={f("cbm")} hint="Length × Width × Height ÷ 1,000,000">
                <FI id={f("cbm")} value={m.cbm} readOnly tabIndex={-1} className="bg-gray-50 font-mono text-blue-700 font-semibold" />
              </SI>
              <SI label="Volumetric Weight (auto-calculated)" htmlFor={f("vol")} hint={`L × W × H ÷ ${divisor.toLocaleString("en-US")} — configured in Shipping Engine Settings`}>
                <FI id={f("vol")} value={`${m.volumetric} KG`} readOnly tabIndex={-1} className="bg-gray-50 font-mono text-blue-700 font-semibold" />
              </SI>
            </div>
            <p className="text-xs text-gray-400">
              CBM and volumetric weight are calculated automatically from package dimensions. Use package dimensions, not product dimensions alone.
            </p>
          </div>

          {/* ── 6. Shipping Information ── */}
          <SecHead n={6} title="Shipping Information" />
          <div className="space-y-4">
            {form.location_kind === "warehouse" ? (
              <SI label="Origin" htmlFor={f("origin")} hint="Automatically linked to Product Location">
                <FI id={f("origin")} value={warehouse ? `${warehouse.city_name}, ${warehouse.country_name}` : "Choose a Product Location"} readOnly tabIndex={-1} className="bg-gray-50 text-gray-500" />
              </SI>
            ) : (
              <SI label="Origin Country" htmlFor={f("origin")} error={errors.origin_country} hint="Where the vendor ships from (the product isn't at an Agiza location)">
                <FS id={f("origin")} value={form.origin_country} onChange={(e) => set("origin_country", e.target.value)}>
                  <option value="">— Select origin country —</option>
                  {(countries.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </FS>
              </SI>
            )}
            <div data-error={errors.shipping_methods ? "true" : undefined}>
              <p className="block text-sm font-semibold text-gray-700 mb-2">Available Shipping Methods</p>
              {methods.isPending ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-5 w-40" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(methods.data ?? [])
                    .filter((x) => x.status === "active" || form.shipping_methods.includes(x.id))
                    .map((x) => (
                      <label key={x.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={form.shipping_methods.includes(x.id)} onChange={() => toggleId("shipping_methods", x.id)} className="rounded border-gray-300 text-blue-600" />
                        {x.name}
                      </label>
                    ))}
                  {methods.data?.length === 0 && <p className="text-xs text-gray-400">No shipping methods configured in the Shipping Engine.</p>}
                </div>
              )}
              {errors.shipping_methods && <p className="mt-1 text-xs text-red-600">{errors.shipping_methods}</p>}
              <p className="mt-2 text-xs text-gray-400">Shipping prices are calculated automatically by the Shipping Engine — do not enter prices here.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="Ready to Ship (days)" htmlFor={f("ready")} hint="How many days until product is ready to dispatch" error={errors.ready_to_ship_days}>
                <FI id={f("ready")} type="number" min="0" max="365" step="1" inputMode="numeric" value={form.ready_to_ship_days} onChange={(e) => set("ready_to_ship_days", e.target.value)} className="max-w-24" invalid={!!errors.ready_to_ship_days} />
              </SI>
              <SI label="Shipping Notes (optional)" htmlFor={f("snotes")}>
                <FTA id={f("snotes")} rows={2} value={form.shipping_notes} onChange={(e) => set("shipping_notes", e.target.value)} placeholder="Any special shipping notes..." />
              </SI>
            </div>
          </div>

          {/* ── 7. Variations ── */}
          <SecHead n={7} title="Variations" />
          <div className="space-y-3">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold text-gray-700">Has Variations:</span>
              <YesNo name={f("hasvar")} label="Has variations" value={form.has_variations} onChange={(v) => set("has_variations", v)} />
            </div>
            {form.has_variations && (
              <div className="border border-gray-200 rounded-lg overflow-hidden" data-error={errors.variants ? "true" : undefined} tabIndex={errors.variants ? -1 : undefined}>
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Variation Attributes</p>
                  {optionSets.isPending ? (
                    <Skeleton className="h-5 w-64" />
                  ) : (optionSets.data ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400">No option sets yet — create them under Product Options.</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                      {(optionSets.data ?? [])
                        .filter((o) => o.status === "active" || form.variation_options.includes(o.id))
                        .map((o) => (
                          <label key={o.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={form.variation_options.includes(o.id)} onChange={() => toggleId("variation_options", o.id)} className="rounded border-gray-300 text-blue-600" />
                            {o.name}
                          </label>
                        ))}
                    </div>
                  )}
                </div>

                {form.variants.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-white">
                          {["Variant", "SKU", "Price (TSh)", "Stock", "Weight", "Status", ""].map((h, i) => (
                            <th key={h || i} scope="col" className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              {h || <span className="sr-only">Actions</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {form.variants.map((v) => {
                          const thumb = variantThumb(v);
                          const vErr = variantErrors[v.key];
                          return (
                            <tr key={v.key} className={cn("hover:bg-gray-50", vErr && "bg-red-50")}>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2 min-w-32">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview / authenticated proxy URL */}
                                  {thumb && <img src={thumb} alt="" className="size-8 rounded object-cover border border-gray-200" />}
                                  <span className="font-medium text-gray-800">{v.name}</span>
                                </div>
                                {vErr && <p className="text-xs text-red-600 mt-1">{Object.values(vErr)[0]}</p>}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 font-mono text-xs whitespace-nowrap">{v.sku || "—"}</td>
                              <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{v.price ? Number(v.price).toLocaleString("en-US") : <span className="text-gray-400">{form.price ? Number(form.price).toLocaleString("en-US") : "—"}</span>}</td>
                              <td className="px-3 py-2.5 text-gray-700">{v.stock || "0"}</td>
                              <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{v.weight_kg ? `${v.weight_kg} KG` : "—"}</td>
                              <td className="px-3 py-2.5">
                                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", v.status === "active" ? "bg-green-100 text-green-700" : v.status === "out_of_stock" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500")}>
                                  {v.status === "active" ? "Active" : v.status === "out_of_stock" ? "Out of Stock" : "Inactive"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => setVariationOpen({ editing: v })} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" aria-label={`Edit variation ${v.name}`} title="Edit">
                                    <Edit className="size-3.5" />
                                  </button>
                                  <button type="button" onClick={() => removeVariation(v.key)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" aria-label={`Remove variation ${v.name}`} title="Delete">
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <button type="button" onClick={() => setVariationOpen({ editing: null })} className="flex items-center gap-2 text-blue-600 text-sm font-medium hover:text-blue-800 transition-colors">
                    <Plus className="size-4" />
                    Add Variation
                  </button>
                  <p className="text-xs text-gray-400">
                    {form.variants.length} variation{form.variants.length !== 1 ? "s" : ""} · Each can have its own SKU, price, stock, dimensions &amp; images
                  </p>
                </div>
              </div>
            )}
            {errors.variants && (
              <p className="text-xs text-red-600" role="alert">
                {errors.variants}
              </p>
            )}
            {!form.has_variations && initial.has_variations && (
              <p className="text-xs text-orange-600">Saving will deactivate this product&apos;s variations and sell it as a single product.</p>
            )}
          </div>

          {/* ── 8. Description & Specifications ── */}
          <SecHead n={8} title="Description & Specifications" />
          <div className="space-y-4">
            <SI label="Description" htmlFor={f("desc")} hint="Displayed on the customer product page" error={errors.description}>
              <FTA id={f("desc")} rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </SI>
            <div data-error={errors.specifications ? "true" : undefined}>
              <p className="block text-sm font-semibold text-gray-700 mb-2">
                Key Features / Specifications <span className="text-gray-400 font-normal">(optional)</span>
              </p>
              <div className="space-y-2">
                {form.specifications.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <FI
                      aria-label={`Specification ${i + 1} name`}
                      value={s.name}
                      maxLength={80}
                      onChange={(e) => set("specifications", form.specifications.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      className="w-28 sm:w-40 flex-shrink-0"
                      placeholder="Spec name"
                    />
                    <FI
                      aria-label={`Specification ${i + 1} value`}
                      value={s.value}
                      maxLength={200}
                      onChange={(e) => set("specifications", form.specifications.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      placeholder="Value"
                    />
                    <button type="button" onClick={() => set("specifications", form.specifications.filter((_, j) => j !== i))} className="px-2 text-gray-400 hover:text-red-500" aria-label={`Remove specification ${i + 1}`}>
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => set("specifications", [...form.specifications, { name: "", value: "" }])} className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:text-blue-800">
                  <Plus className="size-4" />
                  Add Specification
                </button>
                {errors.specifications && <p className="text-xs text-red-600">{errors.specifications}</p>}
              </div>
            </div>
          </div>

          {/* ── 9. Vendor / Source ── */}
          <SecHead n={9} title="Vendor / Source" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="Vendor / Seller" htmlFor={f("vendor")} error={errors.vendor}>
                <FS
                  id={f("vendor")}
                  value={form.vendor}
                  onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value, vendor_profit_type: "", vendor_profit_value: "" }))}
                >
                  <option value="">{vendors.isPending ? "Loading vendors…" : "Select vendor..."}</option>
                  {(vendors.data ?? [])
                    .filter((v) => v.status === "active" || String(v.id) === form.vendor)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </FS>
              </SI>
              <SI label="Vendor SKU" htmlFor={f("vsku")} error={errors.vendor_sku}>
                <FI id={f("vsku")} value={form.vendor_sku} onChange={(e) => set("vendor_sku", e.target.value)} placeholder="Vendor's product code" maxLength={64} />
              </SI>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SI label="Vendor Location" htmlFor={f("vloc")} error={errors.vendor_location}>
                <FI id={f("vloc")} value={form.vendor_location} onChange={(e) => set("vendor_location", e.target.value)} placeholder={vendor?.location || "e.g. Guangzhou, China"} maxLength={120} />
              </SI>
              <SI label="Verified Vendor" hint={vendor ? "Set on the vendor's profile" : "Choose a vendor"}>
                <YesNo name={f("verified")} label="Verified vendor" value={vendor?.verified ?? false} onChange={() => undefined} disabled className="pt-1" />
              </SI>
            </div>
            {vendor?.profit_scope === "per_product" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SI label="Vendor Profit Type (this product)" htmlFor={f("ptype")} hint={`Default: ${vendor.profit_type === "percent" ? `${Number(vendor.profit_value)}%` : formatTSh(vendor.profit_value)}`}>
                  <FS id={f("ptype")} value={form.vendor_profit_type} onChange={(e) => set("vendor_profit_type", e.target.value as ProfitType | "")}>
                    <option value="">Use vendor default</option>
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (TSh)</option>
                  </FS>
                </SI>
                <SI label="Vendor Profit Value" htmlFor={f("pval")} error={errors.vendor_profit_value}>
                  <FI id={f("pval")} type="number" min="0" step="0.01" inputMode="decimal" value={form.vendor_profit_value} onChange={(e) => set("vendor_profit_value", e.target.value)} placeholder="Empty = vendor default" invalid={!!errors.vendor_profit_value} />
                </SI>
              </div>
            )}
          </div>

          {/* ── 10. Shop & Discovery ── */}
          <SecHead n={10} title="Shop & Discovery" />
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {(
                [
                  ["featured", "Featured Product"],
                  ["ofa_kali", "Ofa Kali"],
                  ["allow_save", "Allow Customer Save"],
                  ["allow_chat", "Allow Customer Chat"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between py-1 gap-3">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <YesNo name={f(key)} label={label} value={form[key]} onChange={(v) => set(key, v)} gap="gap-1.5" className="gap-3" />
                </div>
              ))}
            </div>
            <div>
              <p className="block text-sm font-semibold text-gray-700 mb-1.5">Labels</p>
              {labels.isPending ? (
                <Skeleton className="h-7 w-64" />
              ) : (labels.data ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No labels yet — create them under Labels.</p>
              ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Product labels">
                  {(labels.data ?? []).map((l) => {
                    const on = form.labels.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleId("labels", l.id)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-semibold border transition-colors",
                          on ? LABEL_COLORS[l.color] : "bg-white text-gray-600 border-gray-300 hover:border-gray-400",
                          !l.visible && "opacity-70",
                        )}
                        title={l.visible ? undefined : "Hidden label (not shown in the store)"}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <SI label="Search Keywords / Tags" htmlFor={f("kw")} hint="Comma-separated. Helps customers find this product" error={errors.keywords}>
              <FI id={f("kw")} value={form.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="e.g. smartphone, samsung, android, 5g" maxLength={255} invalid={!!errors.keywords} />
            </SI>
            {form.keywords.trim() && (
              <div className="flex flex-wrap gap-1.5">
                {form.keywords
                  .split(",")
                  .map((k) => k.trim())
                  .filter(Boolean)
                  .map((k, i) => (
                    <Chip key={`${k}-${i}`} label={k}>
                      {k}
                    </Chip>
                  ))}
              </div>
            )}
          </div>

          {/* ── 11. Related Products ── */}
          <SecHead n={11} title="Related Products" />
          <div>
            <p className="text-xs text-gray-500 mb-3">Displayed on the product page as &quot;Bidhaa Zinazohusiana&quot;. For product discovery only — not shown in the buy flow.</p>
            <ProductPicker value={form.related_products} onChange={(v) => set("related_products", v)} addLabel="Add Related Product" excludeId={product?.id} error={errors.related_products} />
          </div>

          {/* ── 12. Frequently Bought Together ── */}
          <SecHead n={12} title="Frequently Bought Together" />
          <div>
            <p className="text-xs text-gray-500 mb-3">Shown after the customer presses &quot;NUNUA SASA&quot;. Not visible as general recommendations on the product page.</p>
            <ProductPicker value={form.bought_together} onChange={(v) => set("bought_together", v)} addLabel="Add Product" excludeId={product?.id} error={errors.bought_together} />
          </div>

          {/* ── 13. Gift Eligibility ── */}
          <SecHead n={13} title="Gift Eligibility" />
          <div className="space-y-3">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold text-gray-700">Gift Eligible:</span>
              <YesNo name={f("gift")} label="Gift eligible" value={form.gift_eligible} onChange={(v) => set("gift_eligible", v)} />
            </div>
            {form.gift_eligible && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Gifts shown alongside Frequently Bought Together after &quot;NUNUA SASA&quot;.</p>
                <ProductPicker value={form.gifts} onChange={(v) => set("gifts", v)} addLabel="Add Gift" excludeId={product?.id} error={errors.gifts} />
              </div>
            )}
          </div>

          {/* ── 14. Tax ── */}
          <SecHead n={14} title="Tax" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SI label="Tax Category" htmlFor={f("tax")} error={errors.tax_category}>
              <FS id={f("tax")} value={form.tax_category} onChange={(e) => set("tax_category", e.target.value as TaxCategory)}>
                {TAX_CATEGORIES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </FS>
            </SI>
            <SI label="VAT Applicable">
              <YesNo name={f("vat")} label="VAT applicable" value={form.vat_applicable} onChange={(v) => set("vat_applicable", v)} className="pt-1" />
            </SI>
          </div>
          <p className="text-xs text-gray-400 mt-1">Actual tax calculation is handled by the Agiza tax/checkout system — do not enter final tax amounts here.</p>
        </fieldset>

        {/* ── 15. Shipping Engine ── (read-only summary, outside the disabled fieldset) */}
        <SecHead n={15} title="Shipping Engine" />
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            {summary.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <p className="text-xs text-gray-500 font-medium">{k}</p>
                <p className="font-semibold text-gray-800 break-words">{v}</p>
              </div>
            ))}
          </div>
          <DeliveryEstimator
            originCountry={form.location_kind === "warehouse" ? warehouse?.country ?? null : form.origin_country ? Number(form.origin_country) : null}
            originLabel={originLabel}
            defaultMethod={onlySea ? "sea" : "air"}
            defaultSensitive={sensitive}
            homeCountryId={homeCountry}
          />
          <p className="text-xs text-gray-500 border-t border-gray-200 pt-3">
            Shipping cost and delivery estimates are calculated automatically by the Shipping Engine based on the customer&apos;s destination, shipping method, product profile, weight, dimensions, CBM, and applicable shipping rules.
          </p>
          <Link href="/shipping-engine/test-rate" className="text-blue-600 text-sm font-medium inline-flex items-center gap-1.5 hover:text-blue-800">
            <Ship className="size-4" />
            Test Shipping Rate →
          </Link>
        </div>
      </div>

      {variationOpen && (
        <VariationModal
          variation={variationOpen.editing}
          optionSets={selectedSets}
          product={product}
          productPrice={form.price}
          takenSkus={takenSkusFor(variationOpen.editing?.key ?? null)}
          divisor={divisor}
          queued={variationOpen.editing ? variantQueue[variationOpen.editing.key] ?? [] : []}
          serverErrors={variationOpen.editing ? variantErrors[variationOpen.editing.key] : undefined}
          onSave={saveVariation}
          onClose={() => setVariationOpen(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message={isNew ? "The new product hasn't been added. Your changes will be lost." : "You have unsaved changes to this product. They will be lost."}
        confirmLabel="Discard Changes"
        tone="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onClose={() => setConfirmDiscard(false)}
      />
    </EditorDialog>
  );
}
