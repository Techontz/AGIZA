"use client";

import { useQuery } from "@tanstack/react-query";
import { Globe, ImagePlus, Link2, Phone, Plus, Trash2, Wrench, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PhotoViewer } from "@/components/ui/photo-viewer";
import { useCities, useCountries } from "@/components/shipping-engine/hooks";
import { cn } from "@/lib/cn";
import { fileSrc } from "@/lib/api/files";
import { quotesApi, type Customer, type Quote, type QuoteItem } from "@/lib/api/services/orders";
import { formatDate, formatTSh } from "@/lib/format";

import { CustomerPicker, errorText, useOrderMutation } from "./shared";

export const SERVICE_BADGE: Record<string, { label: string; className: string; icon: typeof Globe }> = {
  international: { label: "International Order", className: "bg-blue-100 text-blue-800", icon: Globe },
  express: { label: "Express Delivery", className: "bg-green-100 text-green-800", icon: Zap },
  equipment: { label: "Equipment Support", className: "bg-purple-100 text-purple-800", icon: Wrench },
};

export function ServiceTypeBadge({ type }: { type: string }) {
  const s = SERVICE_BADGE[type];
  const Icon = s.icon;
  return (
    <span className={cn("px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit whitespace-nowrap", s.className)}>
      <Icon className="size-3" />
      {s.label}
    </span>
  );
}

const label = "block text-sm font-semibold text-gray-700 mb-2";

/** Thumbnails that open the full-screen viewer (click to enlarge, arrows to browse). */
function PhotoGrid({ photos, alt, size }: { photos: Quote["photos"]; alt: string; size: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const urls = photos.map((photo) => fileSrc(photo.url));
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <button key={photos[i].id} type="button" onClick={() => setOpen(i)} className="block" aria-label={`Enlarge photo ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt} className={`${size} rounded-lg object-cover border border-gray-200 hover:ring-2 hover:ring-blue-400`} />
          </button>
        ))}
      </div>
      <PhotoViewer urls={urls} index={open} onClose={() => setOpen(null)} />
    </>
  );
}

function PhotoStrip({ title, photos }: { title: string; photos: Quote["photos"] }) {
  if (!photos.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
      <PhotoGrid photos={photos} alt={title} size="size-20" />
    </div>
  );
}

const MAX_AGIZA_PHOTOS = 5;

/** Photos staff send with the quotation: ones already attached (removable) plus new files to upload on send. */
function QuotePhotoPicker({
  quote,
  files,
  onFiles,
}: {
  quote: Quote;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  const [removed, setRemoved] = useState<number[]>([]);
  const attached = (quote.photos ?? []).filter((p) => p.from_agiza && !removed.includes(p.id));
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const remove = useOrderMutation((photoId: number) => quotesApi.removePhoto(quote.id, photoId), {
    success: "Photo removed",
    onSuccess: (q) => setRemoved((r) => [...r, ...attached.filter((p) => !q.photos.some((x) => x.id === p.id)).map((p) => p.id)]),
  });
  const room = MAX_AGIZA_PHOTOS - attached.length - files.length;

  return (
    <div>
      <p className={label}>Photos for the customer (optional)</p>
      <p className="text-xs text-gray-500 -mt-1 mb-2">The customer sees these with the quotation in the app, e.g. the exact item you found.</p>
      <div className="flex flex-wrap gap-2">
        {attached.map((photo) => (
          <div key={photo.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileSrc(photo.url)} alt="Attached photo" className="size-20 rounded-lg object-cover border border-gray-200" />
            <button
              type="button"
              onClick={() => remove.mutate(photo.id)}
              disabled={remove.isPending}
              className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full p-0.5 shadow hover:bg-gray-100"
              aria-label="Remove attached photo"
            >
              <X className="size-3.5 text-gray-600" />
            </button>
          </div>
        ))}
        {files.map((file, i) => (
          <div key={previews[i]} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previews[i]} alt={file.name} className="size-20 rounded-lg object-cover border border-blue-300" />
            <button
              type="button"
              onClick={() => onFiles(files.filter((_, j) => j !== i))}
              className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full p-0.5 shadow hover:bg-gray-100"
              aria-label={`Don't send ${file.name}`}
            >
              <X className="size-3.5 text-gray-600" />
            </button>
          </div>
        ))}
        {room > 0 && (
          <label className="size-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-xs text-gray-500 cursor-pointer hover:border-blue-400 hover:text-blue-600">
            <ImagePlus className="size-5" />
            Add photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []).slice(0, room);
                onFiles([...files, ...chosen]);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

/** New photos picked in a dialog (uploaded after the quotation is saved). */
function LocalPhotoPicker({
  files,
  onFiles,
  max = MAX_AGIZA_PHOTOS,
  label: title,
}: {
  files: File[];
  onFiles: (files: File[]) => void;
  max?: number;
  label?: string;
}) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const room = max - files.length;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file, i) => (
        <div key={previews[i]} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previews[i]} alt={file.name} className="size-16 rounded-lg object-cover border border-blue-300" />
          <button
            type="button"
            onClick={() => onFiles(files.filter((_, j) => j !== i))}
            className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full p-0.5 shadow hover:bg-gray-100"
            aria-label={`Remove ${file.name}`}
          >
            <X className="size-3.5 text-gray-600" />
          </button>
        </div>
      ))}
      {room > 0 && (
        <label className="size-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5 text-[11px] text-gray-500 cursor-pointer hover:border-blue-400 hover:text-blue-600">
          <ImagePlus className="size-4" />
          {title ?? "Photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              onFiles([...files, ...Array.from(e.target.files ?? []).slice(0, room)]);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

/** Line total of an item: its amount, or unit price × quantity. */
const itemTotal = (item: Pick<QuoteItem, "quantity">, unit: string, amount: string) =>
  Number(amount) > 0 ? Number(amount) : Number(unit) > 0 ? Number(unit) * item.quantity : 0;

function ItemLines({ items, showPrices }: { items: QuoteItem[]; showPrices?: boolean }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-1">Items ({items.length})</p>
      <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {items.map((item, i) => (
          <li key={item.id} className="p-3 text-sm space-y-1">
            <div className="flex justify-between gap-3">
              <span className="font-medium text-gray-900">
                {i + 1}. {item.name}
                {item.quantity > 1 && <span className="text-gray-500"> ×{item.quantity}</span>}
              </span>
              {showPrices && item.amount && <span className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(item.amount)}</span>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
              {item.service && <span>{item.service_display}</span>}
              {item.category && <span>Category: {item.category}</span>}
              {item.origin_country_name && <span>From {item.origin_country_name}</span>}
              {item.tracking_number && <span>Tracking: {item.tracking_number}</span>}
              {item.link && (
                <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline">
                  <Link2 className="size-3" /> Link
                </a>
              )}
              {item.created_order && <span className="text-green-700 font-medium">Order {item.created_order.reference}</span>}
            </div>
            {item.notes && <p className="text-xs text-gray-600 whitespace-pre-line">{item.notes}</p>}
            {showPrices && item.price_notes && <p className="text-xs text-gray-600">Price note: {item.price_notes}</p>}
            {item.photos.length > 0 && (
              <div className="pt-1">
                <PhotoGrid photos={item.photos} alt={item.name} size="size-12" />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function QuoteSummary({ quote, showPrices }: { quote: Quote; showPrices?: boolean }) {
  const items = quote.items ?? [];
  // Item photos show with their item; the strip shows the quotation-wide ones.
  const loose = (quote.photos ?? []).filter((p) => !p.item);
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1">Quote ID</p>
          <p className="text-gray-900">{quote.reference}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1">Service Type</p>
          <ServiceTypeBadge type={quote.service_type} />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Customer</p>
        <p className="text-gray-900">{quote.customer.full_name}</p>
        {quote.customer.phone && (
          <a href={`tel:${quote.customer.phone}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
            <Phone className="size-3.5" />
            {quote.customer.phone}
          </a>
        )}
      </div>
      {items.length ? (
        <ItemLines items={items} showPrices={showPrices} />
      ) : (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-1">Description</p>
          <p className="text-gray-900 whitespace-pre-line">{quote.description}</p>
        </div>
      )}
      <PhotoStrip title="Customer Photos" photos={loose.filter((p) => !p.from_agiza)} />
      <PhotoStrip title="AGIZA Photos (sent with the quotation)" photos={loose.filter((p) => p.from_agiza)} />
    </>
  );
}

/* ---------------------------------------------------------------- respond */
type ItemPrice = { unit_price: string; amount: string; price_notes: string };

export function RespondDialog({ quote, onClose }: { quote: Quote | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [prices, setPrices] = useState<Record<number, ItemPrice>>({});
  const [error, setError] = useState<string | null>(null);
  const items = useMemo(() => quote?.items ?? [], [quote]);
  const multi = items.length > 0;
  const total = items.reduce((sum, it) => sum + itemTotal(it, prices[it.id]?.unit_price ?? "", prices[it.id]?.amount ?? ""), 0);
  const setPrice = (id: number, k: keyof ItemPrice, value: string) =>
    setPrices((p) => ({ ...p, [id]: { ...{ unit_price: "", amount: "", price_notes: "" }, ...p[id], [k]: value } }));
  useEffect(() => {
    if (quote) {
      setPrices(
        Object.fromEntries(
          (quote.items ?? []).map((it) => [
            it.id,
            {
              unit_price: it.unit_price ? String(Number(it.unit_price)) : "",
              // A re-quote starts from the earlier line total only when it wasn't derived from the unit price.
              amount: it.amount && !it.unit_price ? String(Number(it.amount)) : "",
              price_notes: it.price_notes ?? "",
            },
          ]),
        ),
      );
      setAmount(quote.quoted_amount ? String(Number(quote.quoted_amount)) : "");
      setEta(quote.estimated_delivery ?? "");
      setNotes(quote.response_notes ?? "");
      setFiles([]);
      setError(null);
    }
  }, [quote]);
  const send = useOrderMutation(
    async () => {
      // Photos go up first so the customer's notification arrives with them already attached.
      for (const [i, file] of files.entries()) {
        try {
          await quotesApi.addPhoto(quote!.id, file);
        } catch (e) {
          setFiles(files.slice(i));
          throw e;
        }
      }
      setFiles([]);
      const common = { estimated_delivery: eta || null, response_notes: notes };
      return multi
        ? quotesApi.respond(quote!.id, {
            ...common,
            items: items.map((it) => {
              const p = prices[it.id];
              return Number(p?.amount) > 0
                ? { id: it.id, amount: p.amount, price_notes: p.price_notes }
                : { id: it.id, unit_price: p?.unit_price, price_notes: p?.price_notes ?? "" };
            }),
          })
        : quotesApi.respond(quote!.id, { ...common, quoted_amount: amount });
    },
    { success: "Quotation sent to customer", onSuccess: onClose, onError: (e) => setError(errorText(e)) },
  );
  if (!quote) return null;
  return (
    <Modal open onClose={onClose} title="Respond to Quotation">
      <div className="space-y-4">
        <QuoteSummary quote={quote} />
        {multi ? (
          <div>
            <p className={label}>Price each item (TSh)</p>
            <p className="text-xs text-gray-500 -mt-1 mb-2">Enter a unit price (× quantity) or the line amount. The quotation total is their sum.</p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {items.map((it, i) => {
                const p = prices[it.id] ?? { unit_price: "", amount: "", price_notes: "" };
                const line = itemTotal(it, p.unit_price, p.amount);
                return (
                  <div key={it.id} className="p-3 space-y-2">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-900">
                        {i + 1}. {it.name}
                        {it.quantity > 1 && <span className="text-gray-500"> ×{it.quantity}</span>}
                      </span>
                      <span className="font-semibold text-gray-900 whitespace-nowrap">{line ? formatTSh(line) : "—"}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input type="number" min="0" value={p.unit_price} onChange={(e) => setPrice(it.id, "unit_price", e.target.value)} placeholder="Unit price" aria-label={`Unit price of ${it.name}`} />
                      <Input type="number" min="0" value={p.amount} onChange={(e) => setPrice(it.id, "amount", e.target.value)} placeholder="or line amount" aria-label={`Amount for ${it.name}`} />
                      <Input value={p.price_notes} onChange={(e) => setPrice(it.id, "price_notes", e.target.value)} placeholder="Price note (optional)" aria-label={`Price note for ${it.name}`} />
                    </div>
                  </div>
                );
              })}
              <div className="p-3 flex justify-between text-sm bg-gray-50">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="font-bold text-gray-900">{formatTSh(total)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className={label} htmlFor="q-amount">Quoted Amount (TSh)</label>
            <Input id="q-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount in TSh" />
          </div>
        )}
        <div>
          <label className={label} htmlFor="q-eta">Estimated Delivery Date</label>
          <Input id="q-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="q-notes">Response Notes</label>
          <Textarea id="q-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any additional notes or terms..." />
        </div>
        <QuotePhotoPicker quote={quote} files={files} onFiles={setFiles} />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => {
              if (multi) {
                const unpriced = items.find((it) => !itemTotal(it, prices[it.id]?.unit_price ?? "", prices[it.id]?.amount ?? ""));
                return unpriced ? setError(`Enter a price for ${unpriced.name}.`) : send.mutate(undefined);
              }
              return Number(amount) > 0 ? send.mutate(undefined) : setError("Enter the quoted amount.");
            }}
            disabled={send.isPending}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60"
          >
            {send.isPending ? "Sending…" : "Send Quotation"}
          </button>
          <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- approve */
export function ApproveDialog({ quote, onClose }: { quote: Quote | null; onClose: () => void }) {
  const router = useRouter();
  const countries = useCountries();
  const tz = countries.data?.find((c) => c.iso2 === "TZ");
  const cities = useCities(tz?.id);
  const defaults = useQuery({
    queryKey: ["quotes", "approval-defaults", quote?.id],
    queryFn: () => quotesApi.approvalDefaults(quote!.id),
    enabled: Boolean(quote),
  });
  const [v, setV] = useState<Record<string, string | boolean>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (defaults.data) {
      setV({
        item_details: defaults.data.item_details,
        pickup_address: defaults.data.pickup_address,
        delivery_address: defaults.data.delivery_address,
        source_country: defaults.data.source_country ? String(defaults.data.source_country) : "",
        // App requests name the cities in origin/destination; the addresses may hold a street too.
        pickup_city:
          cities.data?.find((c) => c.name === defaults.data.pickup_address || c.name === quote?.origin)?.id.toString() ?? "",
        delivery_city:
          cities.data?.find((c) => c.name === defaults.data.delivery_address || c.name === quote?.destination)?.id.toString() ?? "",
        priority: "standard",
        package_size: defaults.data.package_size ?? "",
        order_class: "simple",
        service_type: defaults.data.service_type ?? (quote?.service_type === "equipment" ? "installation" : "full_service"),
        equipment: "",
        classification: "simple",
        installment_plan: false,
      });
      setError(null);
    }
  }, [defaults.data, cities.data, quote?.service_type, quote?.origin, quote?.destination]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const num = (k: string) => (v[k] ? Number(v[k]) : null);

  const approve = useOrderMutation(
    () => {
      const t = quote!.service_type;
      const body: Record<string, unknown> =
        t === "express"
          ? { item_details: v.item_details, pickup_address: v.pickup_address, pickup_city: num("pickup_city"),
              delivery_address: v.delivery_address, delivery_city: num("delivery_city"), priority: v.priority,
              package_size: v.package_size }
          : t === "international"
            ? { item_details: v.item_details, source_country: num("source_country"), order_class: v.order_class,
                service_type: v.service_type, installment_plan: v.installment_plan }
            : { item_details: v.item_details, service_type: v.service_type, equipment: v.equipment,
                classification: v.classification, city: num("city") };
      return quotesApi.approve(quote!.id, body);
    },
    {
      success: (q) => {
        const refs = ((q as Quote).created_orders ?? []).map((o) => o.reference);
        return refs.length > 1 ? `${refs.length} orders created: ${refs.join(", ")}` : `Order ${(q as Quote).created_order?.reference} created`;
      },
      onSuccess: (q) => {
        onClose();
        const o = (q as Quote).created_order;
        if (o) {
          const path = o.order_type === "express" ? "express" : o.order_type === "international" ? "international" : "equipment-support";
          router.push(`/orders/${path}?open=${o.id}`);
        }
      },
      onError: (e) => setError(errorText(e)),
    },
  );
  if (!quote) return null;
  const target = quote.service_type === "international" ? "International Orders" : quote.service_type === "express" ? "Express Delivery" : "Equipment Support Orders";
  const items = quote.items ?? [];
  const multi = items.length > 0;
  // Item lines with their own origin don't need the shared one.
  const originNeeded = !multi || items.some((it) => !it.origin_country);

  return (
    <Modal open onClose={onClose} title="Approve & Create Order">
      <div className="space-y-4">
        <QuoteSummary quote={quote} showPrices />
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900 mb-2"><strong>Quoted Amount:</strong> {formatTSh(quote.quoted_amount)}</p>
          {quote.estimated_delivery && (
            <p className="text-sm text-blue-900 mb-2"><strong>Estimated Delivery:</strong> {formatDate(quote.estimated_delivery)}</p>
          )}
          <p className="text-sm text-blue-900"><strong>Notes:</strong> {quote.response_notes || "—"}</p>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-4">
          {multi ? (
            <p className="text-sm text-gray-600">
              <strong>{items.length} orders</strong> will be created in <strong>{target}</strong> — one per item, each with its own
              amount and photos. The details below apply to all of them{quote.service_type === "international" ? " (an item's own origin, service and tracking number win)" : ""}.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600">The new order will be created in <strong>{target}</strong>.</p>
              <Field label="Item details" htmlFor="ap-items">
                <Input id="ap-items" value={String(v.item_details ?? "")} onChange={set("item_details")} />
              </Field>
            </>
          )}
          {quote.service_type === "express" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Pickup address" required htmlFor="ap-pick">
                  <Input id="ap-pick" value={String(v.pickup_address ?? "")} onChange={set("pickup_address")} />
                </Field>
                <Field label="Pickup city" htmlFor="ap-pickcity">
                  <Select id="ap-pickcity" value={String(v.pickup_city ?? "")} onChange={set("pickup_city")}>
                    <option value="">—</option>
                    {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Delivery address" required htmlFor="ap-del">
                  <Input id="ap-del" value={String(v.delivery_address ?? "")} onChange={set("delivery_address")} />
                </Field>
                <Field label="Delivery city" htmlFor="ap-delcity">
                  <Select id="ap-delcity" value={String(v.delivery_city ?? "")} onChange={set("delivery_city")}>
                    <option value="">—</option>
                    {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority" htmlFor="ap-prio">
                  <Select id="ap-prio" value={String(v.priority ?? "standard")} onChange={set("priority")}>
                    <option value="standard">Standard</option>
                    <option value="express">Express</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                </Field>
                <Field label="Package size" htmlFor="ap-size">
                  <Select id="ap-size" value={String(v.package_size ?? "")} onChange={set("package_size")}>
                    <option value="">Not specified</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </Select>
                </Field>
              </div>
            </>
          )}
          {quote.service_type === "international" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={multi ? "Source origin (items without one)" : "Source origin"} required={originNeeded} htmlFor="ap-origin">
                <Select id="ap-origin" value={String(v.source_country ?? "")} onChange={set("source_country")}>
                  <option value="">{originNeeded ? "Select origin..." : "Each item's own origin"}</option>
                  {countries.data?.filter((c) => c.is_sourcing_origin && c.iso2 !== "TZ").map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Order type" htmlFor="ap-class">
                <Select id="ap-class" value={String(v.order_class ?? "simple")} onChange={set("order_class")}>
                  <option value="simple">Simple</option>
                  <option value="bulk">Bulk</option>
                  <option value="machinery">Machinery</option>
                  <option value="fragile">Fragile</option>
                </Select>
              </Field>
              <Field label={multi ? "Service type (items without one)" : "Service type"} htmlFor="ap-svc">
                <Select id="ap-svc" value={String(v.service_type ?? "full_service")} onChange={set("service_type")}>
                  <option value="full_service">Full Service (Agiza sourcing)</option>
                  <option value="deliver_for_me">Deliver for Me</option>
                  <option value="local_purchase">Local Purchase</option>
                  <option value="marketplace">Marketplace</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-7">
                <input type="checkbox" checked={Boolean(v.installment_plan)} onChange={(e) => setV((p) => ({ ...p, installment_plan: e.target.checked }))} className="rounded border-gray-300 text-blue-600" />
                Customer pays in installments
              </label>
            </div>
          )}
          {quote.service_type === "equipment" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Service type" required htmlFor="ap-esvc">
                <Select id="ap-esvc" value={String(v.service_type ?? "installation")} onChange={set("service_type")}>
                  <option value="installation">Installation</option>
                  <option value="product_setup">Product Setup</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="electronic_repair">Electronic Repair</option>
                </Select>
              </Field>
              {!multi && (
                <Field label="Equipment" required htmlFor="ap-equip">
                  <Input id="ap-equip" value={String(v.equipment ?? "")} onChange={set("equipment")} placeholder="e.g. Industrial Bakery Oven X100" />
                </Field>
              )}
              <Field label="Classification" htmlFor="ap-eclass">
                <Select id="ap-eclass" value={String(v.classification ?? "simple")} onChange={set("classification")}>
                  <option value="simple">Simple</option>
                  <option value="bulk">Bulk</option>
                  <option value="machinery">Machinery</option>
                  <option value="fragile">Fragile</option>
                </Select>
              </Field>
              <Field label="City" htmlFor="ap-ecity">
                <Select id="ap-ecity" value={String(v.city ?? "")} onChange={set("city")}>
                  <option value="">—</option>
                  {cities.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => approve.mutate(undefined)}
            disabled={approve.isPending || !defaults.data}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-60"
          >
            {approve.isPending ? "Creating order…" : multi ? `Approve & Create ${items.length} Orders` : "Approve & Create Order"}
          </button>
          <button type="button" onClick={onClose} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- new quotation */
type DraftItem = {
  key: number;
  name: string;
  quantity: string;
  link: string;
  category: string;
  notes: string;
  service: "" | "full_service" | "deliver_for_me";
  tracking_number: string;
  origin_country: string;
  files: File[];
};

let draftKey = 0;
const blankItem = (service: string): DraftItem => ({
  key: ++draftKey,
  name: "",
  quantity: "1",
  link: "",
  category: "",
  notes: "",
  service: service === "international" ? "full_service" : "",
  tracking_number: "",
  origin_country: "",
  files: [],
});

const MAX_CUSTOMER_PHOTOS = 5;

export function NewQuoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const countries = useCountries();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [service, setService] = useState("express");
  const [mode, setMode] = useState<"single" | "items">("single");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCustomer(null);
      setService("express");
      setMode("single");
      setDescription("");
      setOrigin("");
      setDestination("");
      setFiles([]);
      setItems([blankItem("express"), blankItem("express")]);
      setError(null);
    }
  }, [open]);
  const changeService = (value: string) => {
    setService(value);
    // Buy for me / Deliver for me only applies to international quotations.
    setItems((rows) => rows.map((r) => ({ ...r, service: value === "international" ? r.service || "full_service" : "" })));
  };
  const setItem = (key: number, patch: Partial<DraftItem>) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const create = useOrderMutation(
    async () => {
      const filled = items.filter((it) => it.name.trim());
      const body: Record<string, unknown> = { customer_id: customer!.id, service_type: service, origin, destination };
      if (mode === "single") body.description = description;
      else {
        if (description.trim()) body.description = description;
        body.items = filled.map((it) => ({
          name: it.name.trim(),
          quantity: Number(it.quantity) || 1,
          link: it.link.trim(),
          category: it.category.trim(),
          notes: it.notes.trim(),
          service: it.service,
          tracking_number: it.service === "deliver_for_me" ? it.tracking_number.trim() : "",
          origin_country: it.origin_country ? Number(it.origin_country) : null,
        }));
      }
      let quote = await quotesApi.create(body);
      // Photos of the customer's items, uploaded on their behalf (shown with the quotation like their own).
      try {
        if (mode === "single") {
          for (const file of files) quote = await quotesApi.addPhoto(quote.id, file, { customerPhoto: true });
        } else {
          const lines = quote.items ?? [];
          for (const [i, it] of filled.entries()) {
            for (const file of it.files) quote = await quotesApi.addPhoto(quote.id, file, { item: lines[i]?.id });
          }
        }
      } catch (e) {
        // The quotation itself is saved: don't let a retry create it twice.
        toast.error(`A photo didn't upload (${errorText(e)}). Quotation ${quote.reference} was saved without it.`);
      }
      return quote;
    },
    {
      success: (q) => `Quotation ${(q as Quote).reference} recorded`,
      onSuccess: onClose,
      onError: (e) => setError(errorText(e)),
    },
  );
  const submit = () => {
    if (!customer) return setError("Choose or register the customer.");
    if (mode === "single" && !description.trim()) return setError("Describe what the customer needs.");
    if (mode === "items") {
      const filled = items.filter((it) => it.name.trim());
      if (!filled.length) return setError("Add at least one item.");
      const bad = filled.find((it) => !(Number(it.quantity) >= 1));
      if (bad) return setError(`Enter a quantity for ${bad.name}.`);
    }
    create.mutate(undefined);
  };
  const origins = countries.data?.filter((c) => c.iso2 !== "TZ") ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Quotation Request"
      size={mode === "items" ? "3xl" : "2xl"}
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={create.isPending}>
            {mode === "items" ? `Save Request (${items.filter((it) => it.name.trim()).length} items)` : "Save Request"}
          </Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" required hint="Search by name or phone, or register a walk-in customer with their phone number.">
          <CustomerPicker value={customer} onChange={setCustomer} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Service Type" required htmlFor="nq-service">
            <Select id="nq-service" value={service} onChange={(e) => changeService(e.target.value)}>
              <option value="express">Express Delivery</option>
              <option value="international">International Order</option>
              <option value="equipment">Equipment Support</option>
            </Select>
          </Field>
          <Field label="Request" htmlFor="nq-mode">
            <Select id="nq-mode" value={mode} onChange={(e) => setMode(e.target.value as "single" | "items")}>
              <option value="single">One request (description)</option>
              <option value="items">Several items, one quotation</option>
            </Select>
          </Field>
        </div>
        {mode === "single" ? (
          <>
            <Field label="Description" required htmlFor="nq-desc">
              <Textarea id="nq-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does the customer need?" />
            </Field>
            <div>
              <p className={label}>Photos of the item (optional)</p>
              <LocalPhotoPicker files={files} onFiles={setFiles} max={MAX_CUSTOMER_PHOTOS} />
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Each item is priced separately and becomes its own order when the customer accepts. The customer gets one quotation with the total.
            </p>
            {items.map((it, i) => (
              <div key={it.key} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700">Item {i + 1}</p>
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems((rows) => rows.filter((r) => r.key !== it.key))} className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-red-600" aria-label={`Remove item ${i + 1}`}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem] gap-2">
                  <Input value={it.name} onChange={(e) => setItem(it.key, { name: e.target.value })} placeholder="Product / item name" aria-label={`Item ${i + 1} name`} />
                  <Input type="number" min="1" value={it.quantity} onChange={(e) => setItem(it.key, { quantity: e.target.value })} placeholder="Qty" aria-label={`Item ${i + 1} quantity`} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input type="url" value={it.link} onChange={(e) => setItem(it.key, { link: e.target.value })} placeholder="Link (optional)" aria-label={`Item ${i + 1} link`} />
                  <Input value={it.category} onChange={(e) => setItem(it.key, { category: e.target.value })} placeholder="Category (optional)" aria-label={`Item ${i + 1} category`} />
                </div>
                {service === "international" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Select value={it.service} onChange={(e) => setItem(it.key, { service: e.target.value as DraftItem["service"] })} aria-label={`Item ${i + 1} service`}>
                      <option value="full_service">Buy for me</option>
                      <option value="deliver_for_me">Deliver for me</option>
                    </Select>
                    <Select value={it.origin_country} onChange={(e) => setItem(it.key, { origin_country: e.target.value })} aria-label={`Item ${i + 1} origin country`}>
                      <option value="">Origin country…</option>
                      {origins.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
                    </Select>
                    {it.service === "deliver_for_me" && (
                      <Input value={it.tracking_number} onChange={(e) => setItem(it.key, { tracking_number: e.target.value })} placeholder="Tracking number" aria-label={`Item ${i + 1} tracking number`} />
                    )}
                  </div>
                )}
                <Textarea rows={2} value={it.notes} onChange={(e) => setItem(it.key, { notes: e.target.value })} placeholder="Notes (size, colour, model…)" aria-label={`Item ${i + 1} notes`} />
                <LocalPhotoPicker files={it.files} onFiles={(f) => setItem(it.key, { files: f })} max={MAX_CUSTOMER_PHOTOS} />
              </div>
            ))}
            {items.length < 30 && (
              <Button size="sm" variant="muted" onClick={() => setItems((rows) => [...rows, blankItem(service)])}>
                <Plus className="size-4" /> Add item
              </Button>
            )}
          </div>
        )}
        {service !== "equipment" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Origin" htmlFor="nq-origin">
              <Input id="nq-origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={service === "international" ? "e.g. China" : "e.g. Dar es Salaam"} />
            </Field>
            <Field label="Destination" htmlFor="nq-dest">
              <Input id="nq-dest" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Arusha" />
            </Field>
          </div>
        )}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
