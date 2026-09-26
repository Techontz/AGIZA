"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Loader2, Plus, Star, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { can, useMe } from "@/hooks/use-me";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import { productKeys, productsApi, type ProductDetail } from "@/lib/api/services/products";
import { cn } from "@/lib/cn";

/** A file picked before the product (or variation) exists; uploaded right after saving. */
export interface QueuedImage {
  key: string;
  file: File;
  preview: string;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const MAX_IMAGES = 20;

let seq = 0;
export function queueFiles(files: FileList | null): QueuedImage[] {
  return Array.from(files ?? [])
    .filter((f) => f.type.startsWith("image/"))
    .map((file) => ({ key: `q${++seq}`, file, preview: URL.createObjectURL(file) }));
}

/** Upload several files one after another (the first product image becomes primary). */
export async function uploadAll(
  productId: number,
  files: File[],
  variant?: number,
): Promise<{ detail: ProductDetail | null; failed: number }> {
  let detail: ProductDetail | null = null;
  let failed = 0;
  for (const file of files) {
    try {
      detail = await productsApi.uploadImage(productId, file, variant);
    } catch (err) {
      failed += 1;
      toast.error(`${file.name}: ${errorText(err)}`);
    }
  }
  return { detail, failed };
}

/**
 * Images & Media. For a saved product, uploads / primary / removal are applied
 * immediately; for a new product the picked files are queued and uploaded
 * right after the product is created.
 */
export function ImagesMedia({
  product,
  queued,
  onQueue,
  primaryKey,
  onPrimaryKey,
  disabled,
}: {
  product: ProductDetail | null;
  queued: QueuedImage[];
  onQueue: (next: QueuedImage[]) => void;
  primaryKey: string | null;
  onPrimaryKey: (key: string | null) => void;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const me = useMe();
  // Removing a stored image is a DELETE (needs "manage"); queued files can always be dropped.
  const canRemove = !product || can(me.data, "ecommerce", "manage");
  const [uploading, setUploading] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);

  const saved = (product?.images ?? []).filter((i) => i.variant === null);
  const setDetail = (d: ProductDetail) => {
    qc.setQueryData(productKeys.detail(d.id), d);
    qc.invalidateQueries({ queryKey: productKeys.all, predicate: (q) => q.queryKey[2] === "list" });
  };

  const onPick = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!product) {
      const added = queueFiles(files);
      const room = MAX_IMAGES - queued.length;
      if (added.length > room) toast.error(`A product can have at most ${MAX_IMAGES} images.`);
      const kept = added.slice(0, Math.max(0, room));
      added.slice(kept.length).forEach((q) => URL.revokeObjectURL(q.preview));
      onQueue([...queued, ...kept]);
      if (!primaryKey && kept[0]) onPrimaryKey(kept[0].key);
      return;
    }
    const list = Array.from(files);
    setUploading(list.length);
    const { detail, failed } = await uploadAll(product.id, list);
    setUploading(0);
    if (detail) {
      setDetail(detail);
      toast.success(list.length - failed === 1 ? "Image uploaded" : `${list.length - failed} images uploaded`);
    }
  };

  const makePrimary = async (imageId: number) => {
    if (!product) return;
    setBusyId(imageId);
    try {
      setDetail(await productsApi.makePrimary(product.id, imageId));
      toast.success("Primary image updated");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!product || removeId === null) return;
    setBusyId(removeId);
    try {
      setDetail(await productsApi.removeImage(product.id, removeId));
      toast.success("Image removed");
      setRemoveId(null);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusyId(null);
    }
  };

  const removeQueued = (key: string) => {
    const item = queued.find((q) => q.key === key);
    if (item) URL.revokeObjectURL(item.preview);
    const next = queued.filter((q) => q.key !== key);
    onQueue(next);
    if (primaryKey === key) onPrimaryKey(next[0]?.key ?? null);
  };

  const primarySaved = saved.find((i) => i.is_primary) ?? saved[0];
  const primaryQueued = queued.find((q) => q.key === primaryKey) ?? queued[0];
  const primarySrc = product ? (primarySaved ? fileSrc(primarySaved.url) : null) : primaryQueued?.preview ?? null;
  const count = product ? saved.length : queued.length;

  const thumb = (key: string | number, src: string, isPrimary: boolean, onSelect: () => void, onRemove: () => void, busy: boolean) => (
    <div key={key} className="relative group">
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled || busy || isPrimary}
        title={isPrimary ? "Primary image" : "Set as primary"}
        aria-label={isPrimary ? "Primary image" : "Set as primary image"}
        className="block disabled:cursor-default"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local preview / authenticated proxy URL */}
        <img
          src={src}
          alt=""
          className={cn(
            "size-14 rounded-lg object-cover border-2 transition-all",
            isPrimary ? "border-blue-400" : "border-gray-200 hover:border-blue-300",
            busy && "opacity-50",
          )}
        />
      </button>
      {busy && <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-blue-600" />}
      {!disabled && canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove image"
          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full size-4 flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-600"
        >
          <X className="size-2.5" strokeWidth={3} />
        </button>
      )}
    </div>
  );

  return (
    <div className="pb-4">
      <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <ImageIcon className="size-4 text-gray-500" />
        Images &amp; Media
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-400 mb-1.5">Primary Image</p>
          {primarySrc ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview / authenticated proxy URL */}
              <img src={primarySrc} alt="Primary product image" className="size-28 rounded-xl object-cover border-2 border-blue-400 shadow-sm" />
              <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">Main</span>
            </div>
          ) : (
            <div className="size-28 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
              <ImageIcon className="size-8 text-gray-300" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1.5">
            Gallery ({count}/{MAX_IMAGES})
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {product
              ? saved.map((img) =>
                  thumb(img.id, fileSrc(img.url), img.id === primarySaved?.id, () => makePrimary(img.id), () => setRemoveId(img.id), busyId === img.id),
                )
              : queued.map((q) =>
                  thumb(q.key, q.preview, q.key === primaryQueued?.key, () => onPrimaryKey(q.key), () => removeQueued(q.key), false),
                )}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={`up${i}`} className="size-14 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 flex items-center justify-center">
                <Loader2 className="size-4 animate-spin text-blue-600" />
              </div>
            ))}
            {!disabled && count < MAX_IMAGES && (
              <label className="size-14 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors focus-within:ring-2 focus-within:ring-blue-500">
                <Plus className="size-5 text-gray-400" />
                <span className="text-xs text-gray-400 mt-0.5">Upload</span>
                <input
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="sr-only"
                  aria-label="Upload product images"
                  disabled={uploading > 0}
                  onChange={(e) => {
                    void onPick(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Star className="size-3" />
            {product
              ? "Click a thumbnail to set it as the primary image. Changes to images are saved immediately."
              : "Click a thumbnail to choose the primary image. Images are uploaded when you add the product."}
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={removeId !== null}
        title="Remove image"
        message="This image will be deleted from the product. This can't be undone."
        confirmLabel="Remove Image"
        tone="danger"
        pending={busyId !== null && busyId === removeId}
        onConfirm={remove}
        onClose={() => setRemoveId(null)}
      />
    </div>
  );
}
