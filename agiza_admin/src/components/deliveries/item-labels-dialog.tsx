"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import { deliveriesApi, deliveryKeys, type Delivery } from "@/lib/api/services/deliveries";

type Draft = Record<string, { sku: string; bin_code: string }>;

const draftOf = (d: Delivery): Draft => Object.fromEntries(d.items.map((i) => [i.key, { sku: i.sku, bin_code: i.bin_code }]));

/** "Edit SKU & Bin" button + modal: every item of the delivery editable at once, one Save for the changed rows. */
export function EditItemLabelsButton({ delivery, className }: { delivery: Delivery; className?: string }) {
  const [open, setOpen] = useState(false);
  if (delivery.items.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center justify-center gap-2", className)}
        aria-label={`Edit SKU and bin codes for ${delivery.reference}`}
      >
        <ScanBarcode className="size-4" /> Edit SKU &amp; Bin
      </button>
      <ItemLabelsDialog delivery={delivery} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ItemLabelsDialog({ delivery: d, open, onClose }: { delivery: Delivery; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(d));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the delivery's current values each time the dialog opens.
  useEffect(() => {
    if (open) {
      setDraft(draftOf(d));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open, not on every refetch
  }, [open]);

  const changed = d.items.filter((i) => {
    const v = draft[i.key];
    return v && (v.sku.trim() !== i.sku || v.bin_code.trim() !== i.bin_code);
  });

  const set = (key: string, field: "sku" | "bin_code", value: string) =>
    setDraft((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { sku: "", bin_code: "" }), [field]: value } }));

  const save = async () => {
    if (changed.length === 0) return onClose();
    setSaving(true);
    setError(null);
    let done = 0;
    try {
      // One request per changed row, in order, so a failure tells exactly which item didn't save.
      for (const i of changed) {
        const v = draft[i.key];
        await deliveriesApi.itemLabel(d.id, { key: i.key, sku: v.sku.trim(), bin_code: v.bin_code.trim() });
        done += 1;
      }
      toast.success(`SKU / bin codes saved on ${d.reference} (${done} ${done === 1 ? "item" : "items"})`);
      onClose();
    } catch (e) {
      const failed = changed[done];
      setError(`${failed ? `${failed.product_name}: ` : ""}${errorText(e)}${done ? ` (${done} saved before the error)` : ""}`);
    } finally {
      setSaving(false);
      if (done) qc.invalidateQueries({ queryKey: deliveryKeys.all });
    }
  };

  const cell = "px-3 py-2 text-sm";
  const field = "w-full min-w-28 rounded border border-gray-300 px-2 py-1 font-mono text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50";
  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={`SKU & Bin Codes — ${d.reference}`}
      size="3xl"
      footer={
        <>
          <Button className="flex-1" onClick={save} loading={saving} disabled={changed.length === 0}>
            Save changes{changed.length > 0 ? ` (${changed.length})` : ""}
          </Button>
          <Button variant="muted" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Edit any row, then save; only the rows you changed are updated.</p>
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Product", "SKU", "Bin Code", "Warehouse", "Qty"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.items.map((i) => {
                const v = draft[i.key] ?? { sku: i.sku, bin_code: i.bin_code };
                const dirty = v.sku.trim() !== i.sku || v.bin_code.trim() !== i.bin_code;
                return (
                  <tr key={i.key} className={dirty ? "bg-yellow-50" : undefined}>
                    <td className={cn(cell, "text-gray-900")}>
                      {i.product_name}
                      {i.variant_name && i.variant_name !== "Default" && <span className="block text-xs text-gray-500">{i.variant_name}</span>}
                    </td>
                    <td className={cell}>
                      <input aria-label={`SKU for ${i.product_name}`} className={field} maxLength={64} value={v.sku} disabled={saving} onChange={(e) => set(i.key, "sku", e.target.value)} />
                    </td>
                    <td className={cell}>
                      <input
                        aria-label={`Bin code for ${i.product_name}`}
                        className={field}
                        maxLength={60}
                        value={v.bin_code}
                        disabled={saving}
                        onChange={(e) => set(i.key, "bin_code", e.target.value)}
                      />
                    </td>
                    <td className={cn(cell, "text-gray-700 whitespace-nowrap")}>{i.warehouse || "—"}</td>
                    <td className={cn(cell, "text-gray-900")}>{i.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
