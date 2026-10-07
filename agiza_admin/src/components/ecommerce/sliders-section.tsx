"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { fileSrc } from "@/lib/api/files";
import { catalogApi, catalogKeys, type MobileSlider } from "@/lib/api/services/catalog";

import { DeleteDialog, IconSwitch, miniInput, miniLabel, useCatalogAccess, useCatalogMutation, type Errors } from "./shared";

/** Banners on the AGIZA customer app's home screen: an image, an optional title and link. */
export function SlidersSection() {
  const { canEdit } = useCatalogAccess();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: catalogKeys.sliders, queryFn: ({ signal }) => catalogApi.sliders.list(signal) });
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<MobileSlider | null>(null);

  const toggle = useCatalogMutation((s: MobileSlider) => catalogApi.sliders.update(s.id, { is_active: !s.is_active }), {
    success: (s) => `${s.title || "Slider"} is now ${s.is_active ? "shown" : "hidden"}`,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: catalogKeys.sliders });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrors({ file: "Choose a banner image (JPEG, PNG or WebP)." });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const slider = await catalogApi.sliders.create({ title: title.trim(), link: link.trim(), is_active: true, sort_order: (list.data?.length ?? 0) + 1 });
      await catalogApi.sliders.uploadImage(slider.id, file);
      setTitle("");
      setLink("");
      setFile(null);
      toast.success("Slider added to the app");
      refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not add the slider";
      setErrors({ form: message });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const replaceImage = async (slider: MobileSlider, image: File | undefined) => {
    if (!image) return;
    try {
      await catalogApi.sliders.uploadImage(slider.id, image);
      toast.success("Image updated");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the image");
    }
  };

  const sliders = list.data ?? [];

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card className="p-6 shadow-none">
          <h2 className="text-base font-bold text-gray-900 mb-4">Add Slider</h2>
          <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="slider-title" className={miniLabel}>Title</label>
              <input id="slider-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Big Sale" maxLength={120} className={`${miniInput} w-48`} />
            </div>
            <div>
              <label htmlFor="slider-link" className={miniLabel}>Link (optional)</label>
              <input id="slider-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={`${miniInput} w-64`} />
            </div>
            <div>
              <label htmlFor="slider-file" className={miniLabel}>Image *</label>
              <input id="slider-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="size-4 inline mr-1.5" />
              {busy ? "Adding…" : "Add Slider"}
            </button>
          </form>
          {Object.values(errors).length > 0 && <p role="alert" className="text-xs text-red-600 mt-2">{Object.values(errors).join(" ")}</p>}
        </Card>
      )}

      {list.isError && !list.data ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : sliders.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No sliders yet" description="Add a banner to show it at the top of the AGIZA app's home screen." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sliders.map((slider) => (
            <div key={slider.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="aspect-[16/7] bg-gray-100 flex items-center justify-center">
                {slider.has_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${fileSrc(`catalog/sliders/${slider.id}/image`)}?v=${encodeURIComponent(slider.updated_at)}`} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-red-600">No image: not shown in the app</span>
                )}
              </div>
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{slider.title || "Untitled"}</p>
                  {slider.link && <p className="text-xs text-gray-500 truncate">{slider.link}</p>}
                  <p className={`text-xs font-medium mt-0.5 ${slider.is_active ? "text-green-600" : "text-gray-400"}`}>{slider.is_active ? "Shown" : "Hidden"}</p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <label className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer" title="Replace image">
                      <Upload className="size-4" />
                      <span className="sr-only">Replace image of {slider.title || "slider"}</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => replaceImage(slider, e.target.files?.[0])} />
                    </label>
                    <IconSwitch
                      checked={slider.is_active}
                      onChange={() => toggle.mutate(slider)}
                      disabled={toggle.isPending && toggle.variables?.id === slider.id}
                      label={`${slider.title || "Slider"} shown`}
                    />
                    <button
                      type="button"
                      onClick={() => setDeleting(slider)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label={`Delete ${slider.title || "slider"}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteDialog
        open={Boolean(deleting)}
        title="Delete Slider"
        name={deleting?.title || "this slider"}
        onDelete={() => catalogApi.sliders.remove(deleting!.id)}
        onDeactivate={deleting?.is_active ? () => catalogApi.sliders.update(deleting.id, { is_active: false }) : undefined}
        deactivateLabel="Hide Instead"
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
