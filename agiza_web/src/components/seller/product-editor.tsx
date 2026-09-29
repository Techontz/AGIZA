"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Plus, Star, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, errorMessage } from "@/lib/api/client";
import { sellerApi, shopApi, type SellerProductInput } from "@/lib/api/endpoints";
import type { SellerProductDetail } from "@/lib/api/types";

import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/field";
import { Card, Notice } from "../ui/states";
import { ListingBadge } from "./listing-badge";

type VariantRow = { id?: number; name: string; price: string; stock: string; status: "active" | "inactive" };

const CONDITIONS = [
  ["new", "New"],
  ["used", "Used"],
  ["refurbished", "Refurbished"],
  ["open_box", "Open box"],
];

/**
 * A vendor's product. What the vendor can't decide (seller, commission, stock location,
 * featuring) isn't in this form, and the server ignores it if sent anyway.
 */
export function ProductEditor({ product }: { product?: SellerProductDetail }) {
  const router = useRouter();
  const client = useQueryClient();
  const categories = useQuery({ queryKey: ["categories"], queryFn: shopApi.categories, staleTime: 600_000 });
  const [form, setForm] = useState({
    name: product?.name ?? "",
    category: product ? String(product.category) : "",
    subcategory: product?.subcategory ? String(product.subcategory) : "",
    condition: product?.condition ?? "new",
    description: product?.description ?? "",
    price: product ? String(Number(product.price)) : "",
    compare_at_price: product?.compare_at_price ? String(Number(product.compare_at_price)) : "",
    weight_kg: product?.weight_kg ? String(Number(product.weight_kg)) : "",
    keywords: product?.keywords ?? "",
    status: (product?.status === "draft" || product?.status === "inactive" ? product.status : "active") as "draft" | "active" | "inactive",
    stock: String(product ? product.stock : 0),
    has_variations: product?.has_variations ?? false,
  });
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.has_variations
      ? product.variants.filter((v) => !v.is_default).map((v) => ({ id: v.id, name: v.name, price: String(Number(v.price)), stock: String(v.quantity), status: v.status === "inactive" ? "inactive" : "active" }))
      : [{ name: "", price: "", stock: "0", status: "active" }],
  );
  const [specs, setSpecs] = useState(product?.specifications.length ? product.specifications : [{ name: "", value: "" }]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const top = categories.data?.find((c) => String(c.id) === form.category);

  const save = useMutation({
    mutationFn: (status?: "draft" | "active" | "inactive") => {
      const data: SellerProductInput = {
        name: form.name,
        category: Number(form.category),
        subcategory: form.subcategory ? Number(form.subcategory) : null,
        condition: form.condition,
        description: form.description,
        price: form.price,
        compare_at_price: form.compare_at_price || null,
        weight_kg: form.weight_kg,
        keywords: form.keywords,
        status: status ?? form.status,
        has_variations: form.has_variations,
        specifications: specs.filter((s) => s.name.trim() && s.value.trim()),
        ...(form.has_variations
          ? {
              variants: variants
                .filter((v) => v.name.trim())
                .map((v) => ({ ...(v.id ? { id: v.id } : {}), name: v.name, price: v.price || null, stock: Number(v.stock) || 0, status: v.status })),
            }
          : { stock: Number(form.stock) || 0 }),
      };
      return product ? sellerApi.updateProduct(product.id, data) : sellerApi.createProduct(data);
    },
    onSuccess: (p) => {
      client.invalidateQueries({ queryKey: ["seller"] });
      client.setQueryData(["seller", "product", p.id], p);
      toast.success(p.listing_state === "pending_review" ? "Saved — AGIZA will review it before it goes live" : "Saved");
      if (!product) router.replace(`/seller/products/${p.id}?new=1`);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const f = (name: string) => err?.field(name);
  const disabled = product?.listing_state === "disabled";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      {product ? (
        <div className="flex flex-wrap items-center gap-2">
          <ListingBadge state={product.listing_state} />
          <span className="text-[13px] text-muted">
            {product.reference} · SKU {product.sku}
          </span>
        </div>
      ) : null}
      {product?.review_note && (product.listing_state === "rejected" || product.listing_state === "disabled") ? (
        <Notice tone="danger">
          <span className="font-semibold">Message from AGIZA:</span> {product.review_note}
        </Notice>
      ) : null}
      {product?.listing_state === "pending_review" ? <Notice tone="warning">AGIZA is reviewing this product. It will appear in your store once approved.</Notice> : null}
      {save.isError && !err?.details ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      {err?.details ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}

      <fieldset disabled={disabled} className="space-y-4">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-ink">Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" htmlFor="p-name" error={f("name")} className="sm:col-span-2">
              <Input id="p-name" required maxLength={200} value={form.name} onChange={set("name")} />
            </Field>
            <Field label="Category" htmlFor="p-cat" error={f("category")}>
              <Select id="p-cat" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: "" })}>
                <option value="" disabled>
                  Choose a category
                </option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subcategory (optional)" htmlFor="p-sub" error={f("subcategory")}>
              <Select id="p-sub" value={form.subcategory} onChange={set("subcategory")} disabled={!top?.children.length}>
                <option value="">None</option>
                {top?.children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Condition" htmlFor="p-cond">
              <Select id="p-cond" value={form.condition} onChange={set("condition")}>
                {CONDITIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Search keywords (optional)" htmlFor="p-kw" hint="Other words customers may search for.">
              <Input id="p-kw" maxLength={255} value={form.keywords} onChange={set("keywords")} />
            </Field>
            <Field label="Description" htmlFor="p-desc" error={f("description")} className="sm:col-span-2">
              <Textarea id="p-desc" rows={5} maxLength={5000} value={form.description} onChange={set("description")} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-ink">Price, weight and stock</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Price (TZS)" htmlFor="p-price" error={f("price")}>
              <Input id="p-price" required inputMode="numeric" value={form.price} onChange={set("price")} />
            </Field>
            <Field label="Was price (optional)" htmlFor="p-cmp" error={f("compare_at_price")} hint="Shown struck through.">
              <Input id="p-cmp" inputMode="numeric" value={form.compare_at_price} onChange={set("compare_at_price")} />
            </Field>
            <Field label="Weight (kg)" htmlFor="p-weight" error={f("weight_kg")} hint="Used to calculate delivery.">
              <Input id="p-weight" required inputMode="decimal" value={form.weight_kg} onChange={set("weight_kg")} />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-[14px] font-medium text-ink">
            <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={form.has_variations} onChange={(e) => setForm({ ...form, has_variations: e.target.checked })} />
            This product has options (sizes, colours…)
          </label>
          {!form.has_variations ? (
            <Field label="Units in stock" htmlFor="p-stock" error={f("stock")} className="mt-4 max-w-48">
              <Input id="p-stock" type="number" min={0} value={form.stock} onChange={set("stock")} />
            </Field>
          ) : (
            <div className="mt-4 space-y-2">
              {f("variants") ? <p className="text-[13px] text-danger">{f("variants")}</p> : null}
              <div className="hidden grid-cols-[1fr_140px_110px_110px_40px] gap-2 text-[12px] font-medium text-muted sm:grid">
                <span>Option</span>
                <span>Price (empty = product price)</span>
                <span>Stock</span>
                <span>Status</span>
              </div>
              {variants.map((v, i) => (
                <div key={v.id ?? `new-${i}`} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_140px_110px_110px_40px]">
                  <Input aria-label="Option name" placeholder="e.g. Red / L" value={v.name} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="col-span-2 sm:col-span-1" />
                  <Input aria-label="Option price" inputMode="numeric" placeholder="Price" value={v.price} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                  <Input aria-label="Option stock" type="number" min={0} value={v.stock} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} />
                  <Select aria-label="Option status" value={v.status} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, status: e.target.value as "active" | "inactive" } : x)))}>
                    <option value="active">Active</option>
                    <option value="inactive">Hidden</option>
                  </Select>
                  <button type="button" aria-label="Remove option" onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="flex h-11 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setVariants([...variants, { name: "", price: "", stock: "0", status: "active" }])}>
                Add option
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-ink">Specifications</h2>
          <div className="space-y-2">
            {specs.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2">
                <Input aria-label="Specification" placeholder="e.g. Storage" value={s.name} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input aria-label="Value" placeholder="e.g. 128 GB" value={s.value} onChange={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <button type="button" aria-label="Remove specification" onClick={() => setSpecs(specs.filter((_, j) => j !== i))} className="flex h-11 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setSpecs([...specs, { name: "", value: "" }])}>
              Add specification
            </Button>
          </div>
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <Field label="Visibility" htmlFor="p-status" className="min-w-56">
            <Select id="p-status" value={form.status} onChange={set("status")}>
              <option value="active">Active — show once approved</option>
              <option value="draft">Draft — not submitted</option>
              <option value="inactive">Hidden</option>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="lg" loading={save.isPending}>
              {product ? "Save changes" : form.status === "active" ? "Create and submit for review" : "Create product"}
            </Button>
          </div>
        </Card>
      </fieldset>
    </form>
  );
}

export function ImageManager({ product }: { product: SellerProductDetail }) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const update = (p: SellerProductDetail) => {
    client.setQueryData(["seller", "product", p.id], p);
    client.invalidateQueries({ queryKey: ["seller", "products"] });
  };
  const upload = useMutation({ mutationFn: (file: File) => sellerApi.uploadImage(product.id, file), onSuccess: update, onError: (e) => toast.error(errorMessage(e)) });
  const primary = useMutation({ mutationFn: (id: number) => sellerApi.makePrimary(product.id, id), onSuccess: update, onError: (e) => toast.error(errorMessage(e)) });
  const remove = useMutation({ mutationFn: (id: number) => sellerApi.removeImage(product.id, id), onSuccess: update, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Photos</h2>
        <span className="text-[13px] text-muted">{product.images.length}/10 · JPEG, PNG or WebP up to 8 MB</span>
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {product.images.map((img) => (
          <li key={img.id} className="group relative aspect-square overflow-hidden rounded-md bg-tile">
            {/* Private until approved: served through the signed-in proxy, so not optimised by next/image. */}
            <Image src={img.url} alt="" fill unoptimized sizes="160px" className="object-cover" />
            {img.is_primary ? <span className="absolute top-1.5 left-1.5 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">Main</span> : null}
            <div className="absolute inset-x-1.5 bottom-1.5 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
              {!img.is_primary ? (
                <button type="button" onClick={() => primary.mutate(img.id)} className="flex flex-1 items-center justify-center gap-1 rounded-sm bg-surface/95 py-1 text-[12px] font-medium text-ink">
                  <Star className="size-3.5" aria-hidden /> Main
                </button>
              ) : null}
              <button type="button" aria-label="Remove photo" onClick={() => remove.mutate(img.id)} className="flex items-center justify-center rounded-sm bg-surface/95 px-2 py-1 text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
        {product.images.length < 10 ? (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={upload.isPending}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line-strong text-[13px] font-medium text-muted hover:border-brand hover:text-primary"
            >
              <ImagePlus className="size-6" aria-hidden />
              {upload.isPending ? "Uploading…" : "Add photo"}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = "";
              }}
            />
          </li>
        ) : null}
      </ul>
      <p className="mt-3 text-[13px] text-muted">New photos are checked by AGIZA like the rest of the listing.</p>
    </Card>
  );
}
