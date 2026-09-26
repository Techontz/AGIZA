"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { CustomerPicker } from "@/components/orders/shared";
import { useCities, useCountries } from "@/components/shipping-engine/hooks";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { VariantSearch } from "@/components/warehouse/variant-search";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { cn } from "@/lib/cn";
import type { Customer } from "@/lib/api/services/orders";
import { shopOrdersApi, type ShopChannel, type ShopOrder } from "@/lib/api/services/shop-orders";
import type { VariantOption } from "@/lib/api/services/warehouse";
import { formatTSh } from "@/lib/format";

import { SHOP_INVALIDATE } from "./shared";

interface Line {
  variant: VariantOption;
  quantity: string;
  unitPrice: string;
}

const CHANNELS: [ShopChannel, string][] = [
  ["manual", "Entered by staff"],
  ["web", "Online store"],
  ["app", "Mobile app"],
  ["whatsapp", "WhatsApp"],
  ["shop", "Physical shop"],
];

const FIELDS = ["customer", "items", "shipping_address", "city", "area", "customer_email", "channel", "delivery_fee", "notes"];

const qtyOf = (l: Line) => (/^\d+$/.test(l.quantity) ? Number(l.quantity) : NaN);
const priceOf = (l: Line) => (l.unitPrice.trim() === "" ? Number(l.variant.price) : Number(l.unitPrice));

/** Staff-entered shop order: customer, catalogue lines (stock is reserved), delivery details. */
export function NewShopOrderDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (o: ShopOrder) => void }) {
  const countries = useCountries();
  const tz = countries.data?.find((c) => c.iso2 === "TZ");
  const cities = useCities(tz?.id);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<ShopChannel>("manual");
  const [fee, setFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setCustomer(null);
    setLines([]);
    setAddress("");
    setCity("");
    setArea("");
    setEmail("");
    setChannel("manual");
    setFee("0");
    setNotes("");
    setError(null);
    setLocal({});
  }, [open]);

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + (qtyOf(l) > 0 && priceOf(l) >= 0 ? qtyOf(l) * priceOf(l) : 0), 0), [lines]);
  const feeValue = Number(fee) >= 0 ? Number(fee) : 0;

  const updateLine = (index: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const create = useApiMutation(
    () =>
      shopOrdersApi.create({
        customer: customer!.id,
        items: lines.map((l) => ({
          variant: l.variant.id,
          quantity: qtyOf(l),
          ...(l.unitPrice.trim() !== "" && Number(l.unitPrice) !== Number(l.variant.price) ? { unit_price: l.unitPrice.trim() } : {}),
        })),
        shipping_address: address.trim(),
        city: city ? Number(city) : null,
        area: area.trim(),
        customer_email: email.trim(),
        channel,
        delivery_fee: String(feeValue),
        notes: notes.trim(),
      }),
    {
      invalidate: SHOP_INVALIDATE,
      success: (o) => `Order ${o.reference} created — stock reserved`,
      onSuccess: (o) => {
        onCreated(o);
        onClose();
      },
      onError: setError,
    },
  );

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!customer) errs.customer = "Choose or register the customer.";
    if (!lines.length) errs.items = "Add at least one product.";
    lines.forEach((l, i) => {
      const q = qtyOf(l);
      if (!(q >= 1)) errs[`line_${i}`] = "Enter a quantity of at least 1.";
      else if (q > l.variant.available) errs[`line_${i}`] = `Only ${l.variant.available} available.`;
      else if (!(priceOf(l) >= 0)) errs[`line_${i}`] = "Enter a valid unit price.";
    });
    if (!address.trim()) errs.shipping_address = "Enter the delivery address.";
    if (!(Number(fee) >= 0)) errs.delivery_fee = "Enter a fee of 0 or more.";
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) errs.customer_email = "Enter a valid email address.";
    setLocal(errs);
    if (!Object.keys(errs).length) create.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Shop Order"
      size="3xl"
      footer={
        <>
          <div className="mr-auto self-center text-sm text-gray-600">
            Total: <span className="font-semibold text-gray-900">{formatTSh(subtotal + feeValue)}</span>
          </div>
          <Button variant="muted" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create Order
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Field label="Customer" required>
          <CustomerPicker
            value={customer}
            onChange={(c) => {
              setCustomer(c);
              if (c && !email) setEmail(c.email);
            }}
            error={fe.customer}
          />
        </Field>

        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Order Items</h3>
          <VariantSearch
            onSelect={(v) => setLines((ls) => [...ls, { variant: v, quantity: "1", unitPrice: String(Number(v.price)) }])}
            exclude={lines.map((l) => l.variant.id)}
            error={fe.items}
          />
          {lines.length > 0 && (
            <div className="mt-3 space-y-2">
              {lines.map((l, i) => {
                const lineError = fe[`line_${i}`];
                const total = qtyOf(l) * priceOf(l);
                return (
                  <div key={l.variant.id} className={cn("bg-white p-3 rounded border", lineError ? "border-red-300" : "border-gray-200")}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{l.variant.name}</p>
                        <p className="text-xs text-gray-500">
                          <span className="font-mono">{l.variant.sku}</span> ·{" "}
                          <span className={l.variant.available > 0 ? "text-green-700" : "text-red-600"}>{l.variant.available} available</span>
                        </p>
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="text-xs text-gray-600">
                          Qty
                          <Input
                            type="number"
                            min={1}
                            max={l.variant.available || undefined}
                            step={1}
                            inputMode="numeric"
                            className="w-20 px-2 py-1.5 mt-0.5"
                            value={l.quantity}
                            onChange={(e) => updateLine(i, { quantity: e.target.value })}
                            aria-label={`Quantity of ${l.variant.name}`}
                            invalid={Boolean(lineError)}
                          />
                        </label>
                        <label className="text-xs text-gray-600">
                          Unit price
                          <Input
                            type="number"
                            min={0}
                            step={500}
                            className="w-32 px-2 py-1.5 mt-0.5"
                            value={l.unitPrice}
                            onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                            aria-label={`Unit price of ${l.variant.name}`}
                          />
                        </label>
                        <p className="w-32 text-right font-semibold text-gray-900 pb-2">{Number.isFinite(total) ? formatTSh(total) : "—"}</p>
                        <button
                          type="button"
                          onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                          className="p-2 mb-0.5 rounded-lg hover:bg-red-50 group"
                          aria-label={`Remove ${l.variant.name}`}
                        >
                          <Trash2 className="size-4 text-gray-400 group-hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                    {lineError && <p className="text-xs text-red-600 mt-1">{lineError}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Shipping Address</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Address" required htmlFor="so-address" error={fe.shipping_address}>
                <Textarea id="so-address" rows={2} className="resize-none" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, building, landmark..." />
              </Field>
            </div>
            <Field label="City" htmlFor="so-city" error={fe.city}>
              <Select id="so-city" value={city} onChange={(e) => setCity(e.target.value)} disabled={cities.isPending}>
                <option value="">{cities.isPending ? "Loading cities…" : "Select a city"}</option>
                {cities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Area" htmlFor="so-area" error={fe.area}>
              <Input id="so-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Mikocheni" />
            </Field>
            <Field label="Customer email" htmlFor="so-email" error={fe.customer_email}>
              <Input id="so-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="For the order confirmation" invalid={Boolean(fe.customer_email)} />
            </Field>
            <Field label="Channel" htmlFor="so-channel" error={fe.channel}>
              <Select id="so-channel" value={channel} onChange={(e) => setChannel(e.target.value as ShopChannel)}>
                {CHANNELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Delivery fee (TSh)" htmlFor="so-fee" error={fe.delivery_fee}>
              <Input id="so-fee" type="number" min={0} step={500} value={fee} onChange={(e) => setFee(e.target.value)} invalid={Boolean(fe.delivery_fee)} />
            </Field>
            <Field label="Notes" htmlFor="so-notes" error={fe.notes}>
              <Input id="so-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes (optional)" />
            </Field>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Order Summary</h3>
          <div className="bg-gray-50 p-4 rounded border border-gray-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="text-gray-900">{formatTSh(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Delivery fee:</span>
              <span className="text-gray-900">{formatTSh(feeValue)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-2 border-t border-gray-200">
              <span className="text-gray-900">Total:</span>
              <span className="text-gray-900">{formatTSh(subtotal + feeValue)}</span>
            </div>
          </div>
        </div>

        <FormAlert error={error} shown={FIELDS} />
      </div>
    </Modal>
  );
}
