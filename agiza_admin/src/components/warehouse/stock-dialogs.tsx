"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/cn";
import { errorText } from "@/lib/api/errors";
import {
  inventoryApi,
  inventoryKeys,
  type StockItem,
  type VariantOption,
  type WarehouseLocation,
} from "@/lib/api/services/warehouse";
import { formatDateTime, formatTSh } from "@/lib/format";

import { StockStatusBadge, useLocationOptions, useStockMutation } from "./shared";
import { VariantSearch } from "./variant-search";

const footer = (label: string, onSubmit: () => void, onClose: () => void, pending: boolean) => (
  <>
    <Button variant="ghost" className="ml-auto" onClick={onClose} disabled={pending}>
      Cancel
    </Button>
    <Button onClick={onSubmit} loading={pending}>
      {label}
    </Button>
  </>
);

const locationLabel = (w: Pick<WarehouseLocation, "code" | "name">) => `${w.name} (${w.code})`;

/** Summary of the stock line a dialog acts on. */
function StockSummary({ item }: { item: StockItem }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
      <p className="font-medium text-gray-900">{item.product.name}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        <span className="font-mono">{item.sku}</span> · {locationLabel(item.warehouse)}
        {item.bin_code && <> · <span className="font-mono text-indigo-700">{item.bin_code}</span></>}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
        <span>
          On hand: <strong className="text-gray-900">{item.quantity}</strong>
        </span>
        <span>
          Reserved: <strong className="text-gray-900">{item.reserved}</strong>
        </span>
        <span>
          Available: <strong className="text-gray-900">{item.available}</strong>
        </span>
      </div>
    </div>
  );
}

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);

/* ------------------------------------------------------------- receive */

/** Book incoming stock of a variant into a location (creates the stock line if new). */
export function ReceiveStockDialog({ open, onClose, floor }: { open: boolean; onClose: () => void; floor: "warehouse" | "shop" }) {
  const locations = useLocationOptions(open);
  const [variant, setVariant] = useState<VariantOption | null>(null);
  const [warehouse, setWarehouse] = useState("");
  const [quantity, setQuantity] = useState("");
  const [bin, setBin] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setVariant(null);
      setWarehouse("");
      setQuantity("");
      setBin("");
      setNote("");
      setError(null);
      setLocal({});
    }
  }, [open]);

  const options = useMemo(
    () => (locations.data ?? []).filter((w) => w.status !== "inactive" && (floor === "shop" ? w.type === "shop" : w.type !== "shop")),
    [locations.data, floor],
  );

  const receive = useStockMutation(
    () => inventoryApi.receive({ variant: variant!.id, warehouse: Number(warehouse), quantity: int(quantity), bin_code: bin.trim(), note: note.trim() }),
    {
      success: (s) => `Received ${int(quantity)} × ${s.sku} at ${s.warehouse.name} (now ${s.quantity})`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!variant) errs.variant = "Choose a product.";
    if (!warehouse) errs.warehouse = "Choose a location.";
    if (!(int(quantity) >= 1)) errs.quantity = "Enter a whole number of at least 1.";
    setLocal(errs);
    if (!Object.keys(errs).length) receive.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const shop = floor === "shop";

  return (
    <Modal open={open} onClose={onClose} title={shop ? "Receive Stock into Shop" : "Receive Stock"} size="xl" footer={footer("Receive Stock", submit, onClose, receive.isPending)}>
      <div className="space-y-4">
        <Field label="Product" required error={fe.variant} htmlFor="rcv-variant">
          <VariantSearch id="rcv-variant" value={variant} onSelect={setVariant} onClear={() => setVariant(null)} />
        </Field>
        <Field label={shop ? "Shop location" : "Location"} required htmlFor="rcv-wh" error={fe.warehouse}>
          <Select id="rcv-wh" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} disabled={locations.isPending}>
            <option value="">{locations.isPending ? "Loading locations…" : options.length ? "Select a location" : "No active locations"}</option>
            {options.map((w) => (
              <option key={w.id} value={w.id}>
                {locationLabel(w)} — {w.city_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Quantity received" required htmlFor="rcv-qty" error={fe.quantity}>
            <Input id="rcv-qty" type="number" min={1} step={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} invalid={Boolean(fe.quantity)} />
          </Field>
          <Field label={shop ? "Shelf position" : "Shelf / bin"} htmlFor="rcv-bin" error={fe.bin_code} hint="Optional — keeps the current one when empty.">
            <Input id="rcv-bin" value={bin} onChange={(e) => setBin(e.target.value)} placeholder={shop ? "e.g. Aisle 2, Shelf B" : "e.g. A-03-2"} />
          </Field>
        </div>
        <Field label="Note (optional)" htmlFor="rcv-note" error={fe.note}>
          <Input id="rcv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Supplier delivery, GRN 1042" />
        </Field>
        <FormAlert error={error} shown={["variant", "warehouse", "quantity", "bin_code", "note"]} />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- adjust */

/** Stock count correction (new count + reason), recorded in the ledger. */
export function AdjustStockDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const [count, setCount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (item) {
      setCount(String(item.quantity));
      setReason("");
      setError(null);
      setLocal({});
    }
  }, [item]);

  const adjust = useStockMutation(() => inventoryApi.adjust(item!.id, { new_quantity: int(count), reason: reason.trim() }), {
    success: (s) => `${s.sku} at ${s.warehouse.name}: count set to ${s.quantity}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!item) return;
    const errs: Record<string, string> = {};
    const n = int(count);
    if (!(n >= 0)) errs.new_quantity = "Enter a whole number (0 or more).";
    else if (n < item.reserved) errs.new_quantity = `${item.reserved} units are reserved for orders; the count can't go below that.`;
    else if (n === item.quantity) errs.new_quantity = "The count is unchanged.";
    if (!reason.trim()) errs.reason = "Give a reason for the adjustment.";
    setLocal(errs);
    if (!Object.keys(errs).length) adjust.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const diff = item && int(count) >= 0 ? int(count) - item.quantity : 0;

  return (
    <Modal open={Boolean(item)} onClose={onClose} title="Adjust Stock Count" size="lg" footer={footer("Save Adjustment", submit, onClose, adjust.isPending)}>
      {item && (
        <div className="space-y-4">
          <StockSummary item={item} />
          <Field label="New count (on hand)" required htmlFor="adj-count" error={fe.new_quantity}>
            <Input id="adj-count" type="number" min={item.reserved} step={1} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} invalid={Boolean(fe.new_quantity)} />
          </Field>
          {diff !== 0 && !fe.new_quantity && (
            <p className={cn("text-sm font-medium", diff > 0 ? "text-green-700" : "text-red-600")}>
              {diff > 0 ? `+${diff}` : diff} units
            </p>
          )}
          <Field label="Reason" required htmlFor="adj-reason" error={fe.reason}>
            <Textarea id="adj-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cycle count, damaged units written off" />
          </Field>
          <FormAlert error={error} shown={["new_quantity", "reason"]} />
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ transfer */

/** Move available units to another location (warehouse ↔ shop included). */
export function TransferStockDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const locations = useLocationOptions(Boolean(item));
  const [target, setTarget] = useState("");
  const [quantity, setQuantity] = useState("");
  const [bin, setBin] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (item) {
      setTarget("");
      setQuantity(item.available > 0 ? String(item.available) : "");
      setBin("");
      setError(null);
      setLocal({});
    }
  }, [item]);

  const options = (locations.data ?? []).filter((w) => w.status !== "inactive" && w.id !== item?.warehouse.id);
  const transfer = useStockMutation(() => inventoryApi.transfer(item!.id, { to_warehouse: Number(target), quantity: int(quantity), bin_code: bin.trim() }), {
    success: (s) => `Transferred ${int(quantity)} × ${s.sku} to ${s.warehouse.name}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!item) return;
    const errs: Record<string, string> = {};
    const n = int(quantity);
    if (!target) errs.to_warehouse = "Choose where the stock goes.";
    if (!(n >= 1)) errs.quantity = "Enter a whole number of at least 1.";
    else if (n > item.available) errs.quantity = `Only ${item.available} available to transfer.`;
    setLocal(errs);
    if (!Object.keys(errs).length) transfer.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const toShop = options.find((w) => String(w.id) === target)?.type === "shop";

  return (
    <Modal open={Boolean(item)} onClose={onClose} title="Transfer Stock" size="lg" footer={footer("Transfer", submit, onClose, transfer.isPending)}>
      {item && (
        <div className="space-y-4">
          <StockSummary item={item} />
          {item.available <= 0 && <p className="text-sm text-orange-700">Nothing is available to transfer from this location.</p>}
          <Field label="To location" required htmlFor="tr-to" error={fe.to_warehouse}>
            <Select id="tr-to" value={target} onChange={(e) => setTarget(e.target.value)} disabled={locations.isPending}>
              <option value="">{locations.isPending ? "Loading locations…" : "Select a location"}</option>
              {options.map((w) => (
                <option key={w.id} value={w.id}>
                  {locationLabel(w)} — {w.type_display}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Quantity" required htmlFor="tr-qty" error={fe.quantity} hint={`Up to ${item.available}`}>
              <Input id="tr-qty" type="number" min={1} max={item.available} step={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} invalid={Boolean(fe.quantity)} />
            </Field>
            <Field label={toShop ? "Shelf position at shop" : "Shelf / bin at destination"} htmlFor="tr-bin" error={fe.bin_code} hint="Optional">
              <Input id="tr-bin" value={bin} onChange={(e) => setBin(e.target.value)} placeholder={toShop ? "e.g. Aisle 2, Shelf B" : "e.g. A-03-2"} />
            </Field>
          </div>
          <FormAlert error={error} shown={["to_warehouse", "quantity", "bin_code"]} />
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------- transfer in */

/** Shop floor: pick warehouse stock and move it onto a shop's shelves. */
export function TransferInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const locations = useLocationOptions(open);
  const [search, setSearch] = useState("");
  const term = useDebouncedValue(search.trim(), 250);
  const [source, setSource] = useState<StockItem | null>(null);
  const [shop, setShop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [bin, setBin] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setSearch("");
      setSource(null);
      setShop("");
      setQuantity("");
      setBin("");
      setError(null);
      setLocal({});
    }
  }, [open]);

  const query = { floor: "warehouse", search: term, page_size: 8 };
  const stock = useQuery({
    queryKey: inventoryKeys.list({ ...query, picker: true }),
    queryFn: ({ signal }) => inventoryApi.list(query, signal),
    enabled: open && term.length >= 2 && !source,
    placeholderData: keepPreviousData,
  });
  const shops = (locations.data ?? []).filter((w) => w.type === "shop" && w.status !== "inactive");

  const transfer = useStockMutation(() => inventoryApi.transfer(source!.id, { to_warehouse: Number(shop), quantity: int(quantity), bin_code: bin.trim() }), {
    success: (s) => `${int(quantity)} × ${s.sku} moved to ${s.warehouse.name}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    const errs: Record<string, string> = {};
    const n = int(quantity);
    if (!source) errs.source = "Choose the warehouse stock to move.";
    if (!shop) errs.to_warehouse = "Choose a shop.";
    if (!(n >= 1)) errs.quantity = "Enter a whole number of at least 1.";
    else if (source && n > source.available) errs.quantity = `Only ${source.available} available to transfer.`;
    setLocal(errs);
    if (!Object.keys(errs).length) transfer.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal open={open} onClose={onClose} title="Transfer Stock to Shop" size="xl" footer={footer("Transfer to Shop", submit, onClose, transfer.isPending)}>
      <div className="space-y-4">
        <Field label="From warehouse stock" required error={fe.source} htmlFor="ti-search">
          {source ? (
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <StockSummary item={source} />
              </div>
              <Button size="sm" variant="outline" onClick={() => setSource(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input id="ti-search" type="search" className="pl-9" placeholder="Search by product, SKU or warehouse..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {term.length >= 2 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {stock.isPending ? (
                    <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
                  ) : stock.isError ? (
                    <p className="px-3 py-2 text-sm text-red-600" role="alert">
                      {errorText(stock.error)}
                    </p>
                  ) : stock.data.results.length ? (
                    stock.data.results.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={s.available <= 0}
                        onClick={() => {
                          setSource(s);
                          setQuantity(String(s.available));
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">{s.product.name}</span>
                          <span className="block text-xs text-gray-500">
                            <span className="font-mono">{s.sku}</span> · {s.warehouse.name}
                          </span>
                        </span>
                        <span className={cn("text-xs flex-shrink-0", s.available > 0 ? "text-green-700" : "text-red-600")}>{s.available} available</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-sm text-gray-500">No warehouse stock matches “{term}”.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label="To shop" required htmlFor="ti-shop" error={fe.to_warehouse}>
          <Select id="ti-shop" value={shop} onChange={(e) => setShop(e.target.value)} disabled={locations.isPending}>
            <option value="">{locations.isPending ? "Loading shops…" : shops.length ? "Select a shop" : "No active shop locations"}</option>
            {shops.map((w) => (
              <option key={w.id} value={w.id}>
                {locationLabel(w)} — {w.city_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Quantity" required htmlFor="ti-qty" error={fe.quantity} hint={source ? `Up to ${source.available}` : undefined}>
            <Input id="ti-qty" type="number" min={1} step={1} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} invalid={Boolean(fe.quantity)} />
          </Field>
          <Field label="Shelf position" htmlFor="ti-bin" error={fe.bin_code} hint="Optional">
            <Input id="ti-bin" value={bin} onChange={(e) => setBin(e.target.value)} placeholder="e.g. Aisle 2, Shelf B" />
          </Field>
        </div>
        <FormAlert error={error} shown={["source", "to_warehouse", "quantity", "bin_code"]} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------- shop floor edit */

const VISIBILITY = [
  { value: true, label: "Listed", hint: "Shown to shop customers" },
  { value: false, label: "Hidden", hint: "Kept off the shop floor" },
];

/** Shelf position, shop price and listed / hidden for a shop-floor line. */
export function EditShopItemDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const [bin, setBin] = useState("");
  const [price, setPrice] = useState("");
  const [listed, setListed] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (item) {
      setBin(item.bin_code);
      setPrice(item.shop_price !== null ? String(Number(item.shop_price)) : "");
      setListed(item.listed);
      setError(null);
      setLocal({});
    }
  }, [item]);

  const save = useStockMutation(
    () => inventoryApi.update(item!.id, { bin_code: bin.trim(), shop_price: price.trim() === "" ? null : price.trim(), listed }),
    { success: (s) => `${s.sku} at ${s.warehouse.name} updated`, onSuccess: onClose, onError: setError },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (price.trim() !== "" && !(Number(price) >= 0)) errs.shop_price = "Enter a price of 0 or more, or leave empty.";
    setLocal(errs);
    if (!Object.keys(errs).length) save.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const defaultPrice = item && item.shop_price === null ? item.price : null;

  return (
    <Modal open={Boolean(item)} onClose={onClose} title="Edit Shop Item" size="lg" footer={footer("Save Changes", submit, onClose, save.isPending)}>
      {item && (
        <div className="space-y-4">
          <StockSummary item={item} />
          <Field label="Shelf position" htmlFor="sf-bin" error={fe.bin_code}>
            <Input id="sf-bin" value={bin} onChange={(e) => setBin(e.target.value)} placeholder="e.g. Aisle 2, Shelf B" />
          </Field>
          <Field
            label="Shop price (TSh)"
            htmlFor="sf-price"
            error={fe.shop_price}
            hint={defaultPrice ? `Empty uses the product price (${formatTSh(defaultPrice)}).` : "Empty uses the product price."}
          >
            <Input id="sf-price" type="number" min={0} step={500} value={price} onChange={(e) => setPrice(e.target.value)} invalid={Boolean(fe.shop_price)} />
          </Field>
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Visibility</legend>
            <div className="flex gap-2">
              {VISIBILITY.map((o) => (
                <label
                  key={o.label}
                  className={cn(
                    "flex-1 cursor-pointer rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
                    listed === o.value ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:bg-gray-50",
                  )}
                >
                  <input type="radio" name="sf-listed" className="sr-only" checked={listed === o.value} onChange={() => setListed(o.value)} />
                  <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                  <span className="block text-xs text-gray-500">{o.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <FormAlert error={error} shown={["bin_code", "shop_price", "listed"]} />
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ movements */

/** The stock ledger for one line (latest 100 movements). */
export function MovementsDialog({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const moves = useQuery({
    queryKey: inventoryKeys.movements(item?.id ?? 0),
    queryFn: () => inventoryApi.movements(item!.id),
    enabled: Boolean(item),
  });
  const cell = "px-3 py-2 text-sm";
  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title="Stock Movements"
      size="4xl"
      footer={
        <Button variant="muted" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      }
    >
      {item && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-60">
              <StockSummary item={item} />
            </div>
            <StockStatusBadge status={item.status} label={item.status_display} />
          </div>
          {moves.isPending ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-9 rounded bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : moves.isError ? (
            <div className="text-sm text-red-600" role="alert">
              {errorText(moves.error)}{" "}
              <button type="button" onClick={() => moves.refetch()} className="font-medium text-blue-600 hover:text-blue-800">
                Retry
              </button>
            </div>
          ) : moves.data.length === 0 ? (
            <div className="text-center py-8">
              <History className="size-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No movements recorded yet.</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["Date", "Movement", "Qty", "Reserved", "On hand after", "Order", "Note", "By"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {moves.data.map((m) => (
                    <tr key={m.id}>
                      <td className={cn(cell, "text-xs text-gray-500 whitespace-nowrap")}>{formatDateTime(m.created_at)}</td>
                      <td className={cn(cell, "text-gray-900 whitespace-nowrap")}>{m.kind_display}</td>
                      <td className={cn(cell, "font-semibold whitespace-nowrap", m.quantity_change > 0 ? "text-green-700" : m.quantity_change < 0 ? "text-red-600" : "text-gray-400")}>
                        {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change || "—"}
                      </td>
                      <td className={cn(cell, "whitespace-nowrap", m.reserved_change ? "text-blue-700" : "text-gray-400")}>
                        {m.reserved_change > 0 ? `+${m.reserved_change}` : m.reserved_change || "—"}
                      </td>
                      <td className={cn(cell, "text-gray-900 whitespace-nowrap")}>
                        {m.quantity_after}
                        {m.reserved_after > 0 && <span className="text-xs text-gray-500"> ({m.reserved_after} res.)</span>}
                      </td>
                      <td className={cn(cell, "font-mono text-xs text-gray-700 whitespace-nowrap")}>{m.order ?? "—"}</td>
                      <td className={cn(cell, "text-gray-600 min-w-40")}>{m.note || "—"}</td>
                      <td className={cn(cell, "text-gray-600 whitespace-nowrap")}>{m.created_by?.full_name ?? "System"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {moves.data && moves.data.length >= 100 && <p className="text-xs text-gray-500">Showing the latest 100 movements.</p>}
        </div>
      )}
    </Modal>
  );
}
