"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { errorText } from "@/lib/api/errors";
import { productKeys, productsApi, type ProductImportResult } from "@/lib/api/services/products";

/**
 * Import products from CSV (Excel → Save As → CSV): first a preview that checks every row and saves
 * nothing, then the import. Known SKUs are updated, new SKUs created; only the columns in the file change.
 */
export function ProductImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await productsApi.importCsv(file, dryRun);
      if (dryRun) {
        setPreview(result);
      } else {
        qc.invalidateQueries({ queryKey: productKeys.all });
        toast.success(`${result.created} product(s) added, ${result.updated} updated${result.errors.length ? `, ${result.errors.length} row(s) skipped` : ""}`);
        if (result.errors.length) setPreview(result);
        else close();
      }
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const ready = preview && preview.dry_run && preview.created + preview.updated > 0;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import Products"
      size="2xl"
      footer={
        <>
          {!preview || !preview.dry_run ? (
            <Button className="flex-1" onClick={() => run(true)} loading={busy} disabled={!file}>
              <FileSpreadsheet className="size-4" /> Check file (preview)
            </Button>
          ) : (
            <Button className="flex-1" variant="success" onClick={() => run(false)} loading={busy} disabled={!ready}>
              <Upload className="size-4" /> Import {preview.created + preview.updated} product(s)
            </Button>
          )}
          <Button variant="muted" onClick={close}>
            {preview && !preview.dry_run ? "Close" : "Cancel"}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <ol className="list-decimal pl-5 space-y-1 text-gray-700">
          <li>
            Start from an <strong>Export</strong> of your products, or{" "}
            <a href={productsApi.exportUrl({}, true)} className="text-blue-600 hover:underline inline-flex items-center gap-1">
              <Download className="size-3.5" /> download the template
            </a>
            .
          </li>
          <li>Edit it in Excel / Google Sheets and save as <strong>CSV</strong>. Keep the first row (column names).</li>
          <li>
            Each row is matched by <strong>sku</strong>: an existing SKU is updated, a new SKU is added (needs name, category,
            price). Only the columns you keep are changed — e.g. just <code>sku,price,stock</code> to update prices and stock.
          </li>
        </ol>

        <label className="block rounded-lg border-2 border-dashed border-gray-300 p-5 text-center cursor-pointer hover:bg-gray-50">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              e.target.value = "";
            }}
          />
          <FileSpreadsheet className="size-8 mx-auto text-gray-400 mb-2" />
          {file ? (
            <span className="font-medium text-gray-900">{file.name}</span>
          ) : (
            <span className="text-gray-600">Choose a CSV file</span>
          )}
        </label>

        {preview && (
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 ${preview.dry_run ? "border-blue-200 bg-blue-50" : "border-green-200 bg-green-50"}`}>
              <p className="font-medium text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="size-4 text-green-600" />
                {preview.dry_run ? "Preview — nothing saved yet" : "Imported"}: {preview.created} new, {preview.updated} updated of{" "}
                {preview.rows} row(s)
              </p>
            </div>
            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-red-200">
                <p className="px-3 py-2 bg-red-50 text-red-800 font-medium flex items-center gap-2">
                  <AlertTriangle className="size-4" /> {preview.errors.length} row(s) will be skipped
                </p>
                <ul className="max-h-56 overflow-y-auto divide-y divide-red-100">
                  {preview.errors.map((e) => (
                    <li key={`${e.row}-${e.sku}`} className="px-3 py-2 text-gray-800">
                      <span className="font-mono text-xs text-gray-500">Row {e.row}{e.sku ? ` · ${e.sku}` : ""}</span>
                      <span className="block">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
