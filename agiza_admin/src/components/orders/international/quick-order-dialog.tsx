"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ImagePlus, Plus, Trash2, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { IMAGE_ACCEPT, useObjectUrls } from "@/components/deliveries/form-helpers";
import { CustomerPicker } from "@/components/orders/shared";
import { useOriginCountries } from "@/components/shipping/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { orderKeys, ordersApi, type Customer } from "@/lib/api/services/orders";
import { shippingKeys } from "@/lib/api/services/shipping";
import { cn } from "@/lib/cn";

const MAX_ITEMS = 20;
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

type Service = "full_service" | "deliver_for_me";

interface Item {
  key: number;
  name: string;
  quantity: string;
  service: Service;
  country: string;
  tracking: string;
  supplier: string;
  price: string;
  notes: string;
  photos: File[];
}

type ItemErrors = Partial<Record<"name" | "quantity" | "country" | "tracking" | "supplier" | "price" | "notes" | "photos" | "form", string>>;

interface Result {
  key: number;
  label: string;
  ok: boolean;
  reference?: string;
  status?: string;
  service?: Service;
  message?: string;
}

/** API field → item field (anything else is shown as the item's general error). */
const API_FIELDS: Record<string, keyof ItemErrors> = {
  item_details: "name",
  source_country: "country",
  tracking_number: "tracking",
  supplier_name: "supplier",
  total_amount: "price",
  notes: "notes",
};

let nextKey = 1;
const blankItem = (from?: Item): Item => ({
  key: nextKey++,
  name: "",
  quantity: "1",
  // A new row keeps the previous row's type and origin: batches usually share them.
  service: from?.service ?? "full_service",
  country: from?.country ?? "",
  tracking: "",
  supplier: "",
  price: "",
  notes: "",
  photos: [],
});

const qtyOf = (it: Item) => (/^\d+$/.test(it.quantity.trim()) ? Number(it.quantity.trim()) : NaN);
const detailsOf = (it: Item) => {
  const q = qtyOf(it);
  return q > 1 ? `${it.name.trim()} × ${q}` : it.name.trim();
};

function validate(it: Item): ItemErrors {
  const e: ItemErrors = {};
  const q = qtyOf(it);
  if (!it.name.trim()) e.name = "Enter the item name.";
  if (!(q >= 1)) e.quantity = "At least 1.";
  else if (detailsOf(it).length > 255) e.name = "Keep the item name under 255 characters.";
  if (!it.country) e.country = "Choose the country it comes from.";
  if (it.service === "deliver_for_me" && !it.tracking.trim()) e.tracking = "Deliver for me needs the supplier's tracking number.";
  else if (it.tracking.trim().length > 80) e.tracking = "At most 80 characters.";
  if (it.supplier.trim().length > 150) e.supplier = "At most 150 characters.";
  if (it.price.trim() && !(Number(it.price) > 0)) e.price = "Enter a price above 0, or leave it empty.";
  if (it.photos.some((f) => f.size > MAX_PHOTO_BYTES)) e.photos = "Each photo must be 8 MB or smaller.";
  return e;
}

/**
 * Staff "quick order": several Buy for me / Deliver for me orders for one client at once,
 * created straight away (no quotation). One international order per item.
 */
export function QuickOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const countries = useOriginCountries();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerError, setCustomerError] = useState<string>();
  const [items, setItems] = useState<Item[]>([]);
  const [errors, setErrors] = useState<Record<number, ItemErrors>>({});
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const running = progress !== null;

  useEffect(() => {
    if (!open) return;
    setCustomer(null);
    setCustomerError(undefined);
    setItems([blankItem()]);
    setErrors({});
    setResults([]);
    setProgress(null);
  }, [open]);

  const update = (key: number, patch: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    // Editing a field clears its error.
    setErrors((errs) => {
      if (!errs[key]) return errs;
      const next = { ...errs[key] };
      for (const k of Object.keys(patch)) delete next[k as keyof ItemErrors];
      if (patch.service) delete next.tracking;
      delete next.form;
      return { ...errs, [key]: next };
    });
  };
  const remove = (key: number) => setItems((list) => list.filter((it) => it.key !== key));
  const add = () => setItems((list) => (list.length >= MAX_ITEMS ? list : [...list, blankItem(list[list.length - 1])]));

  const close = () => {
    if (!running) onClose();
  };

  const submit = async () => {
    const errs: Record<number, ItemErrors> = {};
    for (const it of items) {
      const e = validate(it);
      if (Object.keys(e).length) errs[it.key] = e;
    }
    setErrors(errs);
    setCustomerError(customer ? undefined : "Choose or register the client.");
    if (!customer || Object.keys(errs).length || !items.length) return;

    const done: Result[] = [];
    const failed: Record<number, ItemErrors> = {};
    let customerFailure: string | undefined;
    for (const [index, it] of items.entries()) {
      setProgress(`Creating order ${index + 1} of ${items.length}…`);
      const label = detailsOf(it);
      let order;
      try {
        order = await ordersApi.international.create({
          customer: customer.id,
          item_details: label,
          source_country: Number(it.country),
          service_type: it.service,
          tracking_number: it.tracking.trim(),
          supplier_name: it.supplier.trim(),
          notes: it.notes.trim(),
          ...(it.price.trim() ? { total_amount: it.price.trim() } : {}),
        });
      } catch (err) {
        const fields = fieldErrors(err);
        const mapped: ItemErrors = {};
        const rest: string[] = [];
        for (const [k, v] of Object.entries(fields)) {
          if (API_FIELDS[k]) mapped[API_FIELDS[k]] = v;
          else if (k === "customer") customerFailure = v;
          else rest.push(v);
        }
        if (rest.length || !Object.keys(fields).length) mapped.form = rest.length ? rest.join(" ") : errorText(err);
        failed[it.key] = mapped;
        done.push({ key: it.key, label, ok: false, message: errorText(err) });
        continue;
      }
      let photoProblem: string | undefined;
      for (const [p, file] of it.photos.entries()) {
        setProgress(`Order ${index + 1} of ${items.length}: uploading photo ${p + 1} of ${it.photos.length}…`);
        try {
          await ordersApi.international.upload(order.id, file);
        } catch (err) {
          photoProblem = `Photo “${file.name}” was not uploaded: ${errorText(err)} Add it from the order's details.`;
        }
      }
      done.push({ key: it.key, label, ok: true, reference: order.reference, status: order.status_display, service: it.service, message: photoProblem });
    }
    setProgress(null);

    const created = done.filter((r) => r.ok);
    if (created.length) {
      qc.invalidateQueries({ queryKey: orderKeys.all });
      qc.invalidateQueries({ queryKey: shippingKeys.all });
    }
    if (created.length === done.length) {
      toast.success(`${created.length} ${created.length === 1 ? "order" : "orders"} created`);
      if (created.some((r) => r.message)) toast.warning("Some photos were not uploaded. Add them from the order details.");
      onClose();
      return;
    }
    // Keep only the failed items so staff can fix them and retry just those.
    setResults((prev) => [...prev, ...done]);
    setItems((list) => list.filter((it) => failed[it.key]));
    setErrors(failed);
    if (customerFailure) setCustomerError(customerFailure);
    if (created.length) toast.success(`${created.length} of ${done.length} orders created — fix the rest and try again`);
    else toast.error("No orders were created — check the highlighted items");
  };

  const count = items.length;
  return (
    <Modal
      open={open}
      onClose={close}
      title="New Order"
      size="2xl"
      footer={
        <>
          {progress && <p className="mr-auto self-center text-sm text-gray-600" aria-live="polite">{progress}</p>}
          <Button variant="muted" onClick={close} disabled={running}>
            {results.length ? "Close" : "Cancel"}
          </Button>
          <Button onClick={submit} loading={running} disabled={!count}>
            Create {count} {count === 1 ? "order" : "orders"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-gray-600 -mt-1">
          Orders start straight away — no quotation. <strong>Deliver for me</strong> goes to Shipping &amp; Tracking → Waiting to Receive;{" "}
          <strong>Buy for me</strong> goes to Procurement.
        </p>

        {results.length > 0 && <ResultList results={results} />}

        <Field label="Client" required>
          <CustomerPicker
            value={customer}
            onChange={(c) => {
              setCustomer(c);
              setCustomerError(undefined);
            }}
            error={customerError}
          />
        </Field>
        {customer && customerError && <p className="text-xs text-red-600 -mt-4">{customerError}</p>}

        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Items</h3>
          {items.map((it, i) => (
            <ItemCard
              key={it.key}
              index={i}
              item={it}
              errors={errors[it.key] ?? {}}
              countries={countries.data ?? []}
              countriesLoading={countries.isPending}
              canRemove={items.length > 1}
              disabled={running}
              onChange={(patch) => update(it.key, patch)}
              onRemove={() => remove(it.key)}
            />
          ))}
          {items.length < MAX_ITEMS ? (
            <Button variant="outline" size="sm" onClick={add} disabled={running}>
              <Plus className="size-4" /> Add another item
            </Button>
          ) : (
            <p className="text-xs text-gray-500">Up to {MAX_ITEMS} items at a time.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ parts */

function ResultList({ results }: { results: Result[] }) {
  return (
    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100" role="status">
      {results.map((r, i) => (
        <div key={`${r.key}-${i}`} className="flex items-start gap-3 px-4 py-2 text-sm">
          {r.ok ? (
            r.message ? <AlertTriangle className="size-4 mt-0.5 text-amber-500 flex-shrink-0" /> : <CheckCircle2 className="size-4 mt-0.5 text-green-600 flex-shrink-0" />
          ) : (
            <XCircle className="size-4 mt-0.5 text-red-600 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-gray-900">
              {r.ok && <span className="font-semibold mr-2">{r.reference}</span>}
              <span className={r.ok ? "text-gray-700" : "font-medium"}>{r.label}</span>
              {r.ok && <span className="text-gray-500"> · {r.status}{r.service === "deliver_for_me" ? " (Shipping & Tracking)" : " (Procurement)"}</span>}
            </p>
            {r.message && <p className={cn("text-xs mt-0.5", r.ok ? "text-amber-700" : "text-red-600")}>{r.ok ? r.message : `Not created: ${r.message}`}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemCard({
  index,
  item,
  errors,
  countries,
  countriesLoading,
  canRemove,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  item: Item;
  errors: ItemErrors;
  countries: { id: number; display_name: string; name: string }[];
  countriesLoading: boolean;
  canRemove: boolean;
  disabled: boolean;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
}) {
  const id = (f: string) => `qo-${item.key}-${f}`;
  const dfm = item.service === "deliver_for_me";
  const hasError = Object.keys(errors).length > 0;
  return (
    <fieldset disabled={disabled} aria-label={`Item ${index + 1}`} className={cn("border rounded-lg p-4 space-y-4 bg-white", hasError ? "border-red-300" : "border-gray-200")}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-gray-900">Item {index + 1}</p>
        {canRemove && (
          <button type="button" onClick={onRemove} className="p-2 -m-2 rounded-lg hover:bg-red-50 group" aria-label={`Remove item ${index + 1}`}>
            <Trash2 className="size-4 text-gray-400 group-hover:text-red-500" />
          </button>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-50" role="group" aria-label={`Order type for item ${index + 1}`}>
        {([["full_service", "Buy for me"], ["deliver_for_me", "Deliver for me"]] as const).map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={item.service === v}
            onClick={() => onChange({ service: v })}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
              item.service === v ? "bg-blue-600 text-white shadow-sm" : "text-gray-700 hover:bg-gray-100",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-3">
          <Field label="Item name" required htmlFor={id("name")} error={errors.name}>
            <Input id={id("name")} value={item.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Nike Air Max sneakers" invalid={Boolean(errors.name)} />
          </Field>
        </div>
        <Field label="Quantity" htmlFor={id("quantity")} error={errors.quantity}>
          <Input id={id("quantity")} type="number" min={1} step={1} inputMode="numeric" value={item.quantity} onChange={(e) => onChange({ quantity: e.target.value })} invalid={Boolean(errors.quantity)} />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Country from" required htmlFor={id("country")} error={errors.country}>
          <Select id={id("country")} value={item.country} onChange={(e) => onChange({ country: e.target.value })} disabled={countriesLoading}>
            <option value="">{countriesLoading ? "Loading countries…" : "Select a country"}</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name || c.name}
              </option>
            ))}
          </Select>
        </Field>
        {dfm && (
          <Field label="Tracking number" required htmlFor={id("tracking")} error={errors.tracking} hint="The supplier's tracking number for the parcel.">
            <Input id={id("tracking")} value={item.tracking} onChange={(e) => onChange({ tracking: e.target.value })} placeholder="e.g. 1Z999AA10123456784" invalid={Boolean(errors.tracking)} />
          </Field>
        )}
        <Field label="Supplier" htmlFor={id("supplier")} error={errors.supplier}>
          <Input id={id("supplier")} value={item.supplier} onChange={(e) => onChange({ supplier: e.target.value })} placeholder="Optional" invalid={Boolean(errors.supplier)} />
        </Field>
        <Field label="Price (TZS)" htmlFor={id("price")} error={errors.price} hint="Optional — can be set later.">
          <Input id={id("price")} type="number" min={0} step={1000} value={item.price} onChange={(e) => onChange({ price: e.target.value })} invalid={Boolean(errors.price)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor={id("notes")} error={errors.notes}>
            <Textarea id={id("notes")} rows={2} className="resize-none" value={item.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Size, colour, link… (optional)" />
          </Field>
        </div>
      </div>

      <Field label="Photos" error={errors.photos}>
        <PhotoPicker files={item.photos} onChange={(photos) => onChange({ photos })} label={`item ${index + 1}`} />
      </Field>

      {errors.form && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errors.form}
        </p>
      )}
    </fieldset>
  );
}

function PhotoPicker({ files, onChange, label }: { files: File[]; onChange: (f: File[]) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const urls = useObjectUrls(files);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        aria-label={`Add photos for ${label}`}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          onChange([...files, ...picked].slice(0, MAX_PHOTOS));
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-3">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative">
            {urls[i] && (
              // eslint-disable-next-line @next/next/no-img-element -- local preview (object URL)
              <img src={urls[i]} alt={`Photo ${i + 1}: ${f.name}`} className="size-20 object-cover rounded-lg border border-gray-200" />
            )}
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full p-1 shadow-sm hover:bg-gray-100"
              aria-label={`Remove photo ${i + 1}`}
            >
              <X className="size-3 text-gray-600" />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="size-20 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 text-xs"
          >
            <ImagePlus className="size-5" />
            Add
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">Optional · JPG, PNG or WebP · up to {MAX_PHOTOS}.</p>
    </div>
  );
}
