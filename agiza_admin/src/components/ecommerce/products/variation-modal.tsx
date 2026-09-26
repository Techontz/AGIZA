"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { can, useMe } from "@/hooks/use-me";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import { productKeys, productsApi, VARIANT_STATUSES, type OptionSet, type ProductDetail, type VariantStatus } from "@/lib/api/services/products";

import { EditorDialog, FI, FS, FTA, Group, SI } from "./editor-ui";
import { measures, type VariantForm } from "./form-model";
import { queueFiles, uploadAll, type QueuedImage } from "./images-media";

let seq = 0;

export function newVariantKey() {
  seq += 1;
  return `n${seq}`;
}

/** Add / Edit Variation: identity, pricing, inventory, dimensions, images and notes. */
export function VariationModal({
  variation,
  optionSets,
  product,
  productPrice,
  takenSkus,
  divisor,
  queued,
  serverErrors,
  onSave,
  onClose,
}: {
  variation: VariantForm | null;
  optionSets: OptionSet[];
  product: ProductDetail | null;
  productPrice: string;
  /** SKUs already used by the product and its other variations. */
  takenSkus: string[];
  divisor: number;
  queued: QueuedImage[];
  serverErrors?: Record<string, string>;
  onSave: (v: VariantForm, queued: QueuedImage[]) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const qc = useQueryClient();
  const me = useMe();
  const canRemove = can(me.data, "ecommerce", "manage");
  const isNew = !variation;
  const [v, setV] = useState<VariantForm>(
    variation ?? {
      key: newVariantKey(),
      name: "",
      sku: "",
      price: "",
      compare_at_price: "",
      stock: "0",
      stockTouched: true,
      weight_kg: "",
      length_cm: "",
      width_cm: "",
      height_cm: "",
      status: "active",
      notes: "",
      option_values: [],
      touched: true,
    },
  );
  const [files, setFiles] = useState<QueuedImage[]>(queued);
  const [uploading, setUploading] = useState(0);
  const [busyImage, setBusyImage] = useState<number | null>(null);
  const [tried, setTried] = useState(false);

  const set = <K extends keyof VariantForm>(key: K, value: VariantForm[K]) => setV((p) => ({ ...p, [key]: value, touched: true }));

  const savedVariant = v.id ? product?.variants.find((x) => x.id === v.id) : undefined;
  const savedImages = savedVariant?.images ?? [];

  const skuTaken = v.sku.trim() !== "" && takenSkus.some((s) => s.toLowerCase() === v.sku.trim().toLowerCase());
  const errors: Record<string, string> = { ...(serverErrors ?? {}) };
  if (tried && !v.name.trim()) errors.name = "Enter the variant label.";
  if (tried && !v.sku.trim()) errors.sku = "Each variation needs its own SKU.";
  if (skuTaken) errors.sku = "This SKU is already used by the product or another variation.";
  if (v.price && v.compare_at_price && Number(v.compare_at_price) < Number(v.price)) {
    errors.compare_at_price = "The compare-at price should be higher than the price.";
  }

  const pickValue = (option: OptionSet, valueId: string) => {
    const others = v.option_values.filter((id) => !option.values.some((x) => x.id === id));
    const next = valueId ? [...others, Number(valueId)] : others;
    setV((p) => {
      const autoName = optionSets
        .map((o) => o.values.find((x) => next.includes(x.id))?.value)
        .filter(Boolean)
        .join(" / ");
      const prevAuto = optionSets
        .map((o) => o.values.find((x) => p.option_values.includes(x.id))?.value)
        .filter(Boolean)
        .join(" / ");
      const name = !p.name.trim() || p.name === prevAuto ? autoName : p.name;
      return { ...p, option_values: next, name, touched: true };
    });
  };

  const onPick = async (list: FileList | null) => {
    if (!list?.length) return;
    if (product && v.id) {
      const arr = Array.from(list);
      setUploading(arr.length);
      const { detail } = await uploadAll(product.id, arr, v.id);
      setUploading(0);
      if (detail) {
        qc.setQueryData(productKeys.detail(detail.id), detail);
        toast.success("Variation image uploaded");
      }
      return;
    }
    setFiles((prev) => [...prev, ...queueFiles(list)]);
  };

  const removeSaved = async (imageId: number) => {
    if (!product) return;
    setBusyImage(imageId);
    try {
      qc.setQueryData(productKeys.detail(product.id), await productsApi.removeImage(product.id, imageId));
      toast.success("Image removed");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusyImage(null);
    }
  };

  const removeQueued = (key: string) => {
    setFiles((prev) => {
      const item = prev.find((q) => q.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((q) => q.key !== key);
    });
  };

  const save = () => {
    setTried(true);
    if (!v.name.trim() || !v.sku.trim() || skuTaken || errors.compare_at_price) return;
    onSave({ ...v, name: v.name.trim(), sku: v.sku.trim() }, files);
  };

  const cancel = () => {
    // Files picked in this session but not kept are released.
    files.filter((f) => !queued.includes(f)).forEach((f) => URL.revokeObjectURL(f.preview));
    onClose();
  };

  const m = measures(v.length_cm, v.width_cm, v.height_cm, divisor);
  const f = (name: string) => `${uid}-${name}`;

  return (
    <EditorDialog
      onClose={cancel}
      layer="z-[60] bg-black/60"
      width="max-w-2xl"
      maxHeight="max-h-[90vh]"
      title={isNew ? "Add Variation" : "Edit Variation"}
      subtitle="Each variation has its own SKU, price, stock, dimensions, and images"
      footer={
        <>
          <Button className="flex-1 px-6 py-2.5 text-sm" onClick={save} disabled={!v.name.trim() || uploading > 0}>
            {isNew ? "Add Variation" : "Save Changes"}
          </Button>
          <Button variant="secondary" className="px-6 py-2.5 text-sm" onClick={cancel}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="p-4 sm:p-6 space-y-5">
        <Group title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SI label="Variant Label *" htmlFor={f("name")} error={errors.name} hint="Displayed to customer as the variation option">
              <FI id={f("name")} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 128GB / Midnight Black" invalid={!!errors.name} />
            </SI>
            <SI label="Variant SKU *" htmlFor={f("sku")} error={errors.sku}>
              <FI id={f("sku")} value={v.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. PROD-001-128-BLK" invalid={!!errors.sku} />
            </SI>
          </div>
          {optionSets.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {optionSets.map((o) => (
                <SI key={o.id} label={o.name} htmlFor={f(`opt${o.id}`)}>
                  <FS
                    id={f(`opt${o.id}`)}
                    value={String(o.values.find((x) => v.option_values.includes(x.id))?.id ?? "")}
                    onChange={(e) => pickValue(o, e.target.value)}
                  >
                    <option value="">— Select {o.name.toLowerCase()} —</option>
                    {o.values.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.value}
                      </option>
                    ))}
                  </FS>
                </SI>
              ))}
            </div>
          )}
        </Group>

        <Group title="Pricing">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SI label="Price (TSh)" htmlFor={f("price")} error={errors.price} hint="Leave empty to use the product price">
              <FI id={f("price")} type="number" min="0" step="0.01" inputMode="decimal" value={v.price} onChange={(e) => set("price", e.target.value)} placeholder={productPrice || "850000"} invalid={!!errors.price} />
            </SI>
            <SI label="Compare-at Price (TSh)" htmlFor={f("cmp")} error={errors.compare_at_price}>
              <FI id={f("cmp")} type="number" min="0" step="0.01" inputMode="decimal" value={v.compare_at_price} onChange={(e) => set("compare_at_price", e.target.value)} placeholder="950000" invalid={!!errors.compare_at_price} />
            </SI>
          </div>
        </Group>

        <Group title="Inventory">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SI label="Stock Quantity" htmlFor={f("stock")} error={errors.stock} hint={isNew ? "Received at the product location when saved" : "Sets the on-hand quantity at the product location"}>
              <FI
                id={f("stock")}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={v.stock}
                onChange={(e) => setV((p) => ({ ...p, stock: e.target.value, stockTouched: true, touched: true }))}
                placeholder="0"
                invalid={!!errors.stock}
              />
            </SI>
            <SI label="Status" htmlFor={f("status")}>
              <FS id={f("status")} value={v.status} onChange={(e) => set("status", e.target.value as VariantStatus)}>
                {VARIANT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </FS>
            </SI>
          </div>
        </Group>

        <Group title="Weight & Dimensions" note="overrides parent product for shipping">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ["weight_kg", "Weight (KG)", "0.50", "0.001"],
                ["length_cm", "Length (cm)", "30", "0.1"],
                ["width_cm", "Width (cm)", "20", "0.1"],
                ["height_cm", "Height (cm)", "10", "0.1"],
              ] as const
            ).map(([key, label, ph, step]) => (
              <SI key={key} label={label} htmlFor={f(key)} error={errors[key]}>
                <FI id={f(key)} type="number" min="0" step={step} inputMode="decimal" value={v[key]} onChange={(e) => set(key, e.target.value)} placeholder={ph} invalid={!!errors[key]} />
              </SI>
            ))}
          </div>
          {(v.length_cm || v.width_cm || v.height_cm) && (
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
              <span>
                CBM: <strong>{m.cbm}</strong> m³
              </span>
              <span>
                Vol. Weight: <strong>{m.volumetric} KG</strong>
              </span>
            </div>
          )}
        </Group>

        <Group title="Variation Images" note="optional — override parent product images">
          <div className="flex flex-wrap gap-2 mb-2">
            {savedImages.map((img) => (
              <div key={img.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL */}
                <img src={fileSrc(img.url)} alt="" className="size-16 rounded-lg object-cover border border-gray-200" />
                {busyImage === img.id && <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-blue-600" />}
                {canRemove && <button
                  type="button"
                  onClick={() => removeSaved(img.id)}
                  disabled={busyImage !== null}
                  aria-label="Remove variation image"
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full size-4 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <X className="size-2.5" strokeWidth={3} />
                </button>}
              </div>
            ))}
            {files.map((q) => (
              <div key={q.key} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={q.preview} alt="" className="size-16 rounded-lg object-cover border border-gray-200" />
                <button
                  type="button"
                  onClick={() => removeQueued(q.key)}
                  aria-label="Remove variation image"
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full size-4 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <X className="size-2.5" strokeWidth={3} />
                </button>
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={`up${i}`} className="size-16 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 flex items-center justify-center">
                <Loader2 className="size-4 animate-spin text-blue-600" />
              </div>
            ))}
            <label className="size-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors focus-within:ring-2 focus-within:ring-blue-500">
              <Plus className="size-5 text-gray-400" />
              <span className="text-xs text-gray-400 mt-0.5">Upload</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="sr-only"
                aria-label="Upload variation images"
                disabled={uploading > 0}
                onChange={(e) => {
                  void onPick(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-xs text-gray-400">
            {product && v.id ? "Variation images are saved immediately." : "Images are uploaded when the product is saved."}
          </p>
        </Group>

        <SI label={<>Internal Notes <span className="text-gray-400 font-normal">(optional)</span></>} htmlFor={f("notes")}>
          <FTA id={f("notes")} rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Only available in UAE bundle; limited stock confirmed with supplier" />
        </SI>
      </div>
    </EditorDialog>
  );
}
