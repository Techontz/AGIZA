"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { engine, type ShippingMethod } from "@/lib/api/services/shipping-engine";

import { applyFieldErrors, useCarrierOptions, useEngineMutation } from "./hooks";

const schema = z.object({
  name: z.string().trim().min(1, "Method name is required").max(80),
  code: z.string().trim().min(1, "Code is required").max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  category: z.enum(["air", "sea", "land", "local"]),
  estimated_delivery: z.string().max(60),
  description: z.string(),
  max_weight_kg: z.string().refine((v) => v === "" || Number(v) > 0, "Must be greater than zero"),
  carriers: z.array(z.number()),
  requires_special_handling: z.boolean(),
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = {
  name: "", code: "", category: "air", estimated_delivery: "", description: "", max_weight_kg: "", carriers: [],
  requires_special_handling: false,
};

const label = "block text-sm font-semibold text-gray-700 mb-1.5";
const field = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

/** Add / edit a shipping method (design: AddMethodModal, which uses its own style). */
export function MethodForm({ open, onClose, method }: { open: boolean; onClose: () => void; method?: ShippingMethod | null }) {
  const titleId = useId();
  const carriers = useCarrierOptions();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    form.reset(
      method
        ? {
            name: method.name, code: method.code, category: method.category, estimated_delivery: method.estimated_delivery,
            description: method.description, max_weight_kg: method.max_weight_kg ?? "", carriers: method.carriers,
            requires_special_handling: method.requires_special_handling,
          }
        : EMPTY,
    );
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, method?.id]);

  const mutation = useEngineMutation(
    (payload: Record<string, unknown>) => (method ? engine.methods.update(method.id, payload) : engine.methods.create(payload)),
    { success: method ? "Shipping method updated" : "Shipping method added", onSuccess: onClose },
  );
  const submit = form.handleSubmit((v) =>
    mutation.mutate(
      { ...v, code: v.code.toUpperCase(), max_weight_kg: v.max_weight_kg === "" ? null : v.max_weight_kg, estimated_delivery: v.estimated_delivery || "TBD" },
      { onError: (err) => setFormError(applyFieldErrors(err, form.setError, Object.keys(EMPTY))) },
    ),
  );
  const { errors } = form.formState;
  if (!open) return null;

  const err = (m?: string) => m && <p className="mt-1 text-xs text-red-600">{m}</p>;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-xl max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id={titleId} className="text-lg font-bold text-gray-900">
            {method ? "Edit Shipping Method" : "Add Shipping Method"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close">
            <X className="size-5 text-gray-400" />
          </button>
        </div>
        <form className="min-h-0 flex-1 p-6 space-y-4 overflow-y-auto" onSubmit={submit}>
          {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="m-name">Method Name *</label>
              <input id="m-name" placeholder="e.g. Air Cargo" className={field} {...form.register("name")} />
              {err(errors.name?.message)}
            </div>
            <div>
              <label className={label} htmlFor="m-code">Code *</label>
              <input id="m-code" placeholder="e.g. AIR" className={`${field} uppercase`} {...form.register("code")} />
              {err(errors.code?.message)}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="m-cat">Category</label>
              <select id="m-cat" className={`${field} bg-white`} {...form.register("category")}>
                <option value="air">Air</option>
                <option value="sea">Sea</option>
                <option value="land">Land</option>
                <option value="local">Local</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="m-eta">Estimated Delivery</label>
              <input id="m-eta" placeholder="e.g. 5–10 days" className={field} {...form.register("estimated_delivery")} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="m-desc">Description</label>
            <textarea id="m-desc" rows={2} placeholder="Brief description of this shipping method..." className={`${field} resize-none`} {...form.register("description")} />
          </div>
          <div>
            <label className={label} htmlFor="m-max">Max Weight (KG)</label>
            <input id="m-max" type="number" step="0.001" min="0" placeholder="Leave blank for unlimited" className={field} {...form.register("max_weight_kg")} />
            {err(errors.max_weight_kg?.message)}
          </div>
          <div>
            <span className={label}>Carriers</span>
            <Controller
              control={form.control}
              name="carriers"
              render={({ field: f }) => (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {(carriers.data ?? []).map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600"
                        checked={f.value.includes(c.id)}
                        onChange={(e) => f.onChange(e.target.checked ? [...f.value, c.id] : f.value.filter((x) => x !== c.id))}
                      />
                      {c.name}
                    </label>
                  ))}
                  {carriers.data?.length === 0 && <p className="text-sm text-gray-400">No carriers yet — add them under Carriers.</p>}
                </div>
              )}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded border-gray-300 text-blue-600" {...form.register("requires_special_handling")} />
            <span className="text-sm font-medium text-gray-700">Requires Special Handling</span>
          </label>
          <button type="submit" hidden />
        </form>
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={mutation.isPending}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? "Saving…" : method ? "Save Method" : "Add Method"}
          </button>
        </div>
      </div>
    </div>
  );
}
