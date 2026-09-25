"use client";

import { useQuery } from "@tanstack/react-query";
import { Globe, Wrench, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useCities, useCountries } from "@/components/shipping-engine/hooks";
import { cn } from "@/lib/cn";
import { quotesApi, type Customer, type Quote } from "@/lib/api/services/orders";
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

function QuoteSummary({ quote }: { quote: Quote }) {
  return (
    <>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Quote ID</p>
        <p className="text-gray-900">{quote.reference}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Customer</p>
        <p className="text-gray-900">{quote.customer.full_name}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Service Type</p>
        <ServiceTypeBadge type={quote.service_type} />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Description</p>
        <p className="text-gray-900">{quote.description}</p>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- respond */
export function RespondDialog({ quote, onClose }: { quote: Quote | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (quote) {
      setAmount(quote.quoted_amount ? String(Number(quote.quoted_amount)) : "");
      setEta(quote.estimated_delivery ?? "");
      setNotes(quote.response_notes ?? "");
      setError(null);
    }
  }, [quote]);
  const send = useOrderMutation(
    () => quotesApi.respond(quote!.id, { quoted_amount: amount, estimated_delivery: eta || null, response_notes: notes }),
    { success: "Quotation sent to customer", onSuccess: onClose, onError: (e) => setError(errorText(e)) },
  );
  if (!quote) return null;
  return (
    <Modal open onClose={onClose} title="Respond to Quotation">
      <div className="space-y-4">
        <QuoteSummary quote={quote} />
        <div>
          <label className={label} htmlFor="q-amount">Quoted Amount (TSh)</label>
          <Input id="q-amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount in TSh" />
        </div>
        <div>
          <label className={label} htmlFor="q-eta">Estimated Delivery Date</label>
          <Input id="q-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="q-notes">Response Notes</label>
          <Textarea id="q-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any additional notes or terms..." />
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => (Number(amount) > 0 ? send.mutate(undefined) : setError("Enter the quoted amount."))}
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
        pickup_city: cities.data?.find((c) => c.name === defaults.data.pickup_address)?.id.toString() ?? "",
        delivery_city: cities.data?.find((c) => c.name === defaults.data.delivery_address)?.id.toString() ?? "",
        priority: "standard",
        package_size: "",
        order_class: "simple",
        service_type: quote?.service_type === "equipment" ? "installation" : "full_service",
        equipment: "",
        classification: "simple",
        installment_plan: false,
      });
      setError(null);
    }
  }, [defaults.data, cities.data, quote?.service_type]);
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
      success: (q) => `Order ${(q as Quote).created_order?.reference} created`,
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

  return (
    <Modal open onClose={onClose} title="Approve & Create Order">
      <div className="space-y-4">
        <QuoteSummary quote={quote} />
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900 mb-2"><strong>Quoted Amount:</strong> {formatTSh(quote.quoted_amount)}</p>
          {quote.estimated_delivery && (
            <p className="text-sm text-blue-900 mb-2"><strong>Estimated Delivery:</strong> {formatDate(quote.estimated_delivery)}</p>
          )}
          <p className="text-sm text-blue-900"><strong>Notes:</strong> {quote.response_notes || "—"}</p>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-4">
          <p className="text-sm text-gray-600">The new order will be created in <strong>{target}</strong>.</p>
          <Field label="Item details" htmlFor="ap-items">
            <Input id="ap-items" value={String(v.item_details ?? "")} onChange={set("item_details")} />
          </Field>
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
              <Field label="Source origin" required htmlFor="ap-origin">
                <Select id="ap-origin" value={String(v.source_country ?? "")} onChange={set("source_country")}>
                  <option value="">Select origin...</option>
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
              <Field label="Service type" htmlFor="ap-svc">
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
              <Field label="Equipment" required htmlFor="ap-equip">
                <Input id="ap-equip" value={String(v.equipment ?? "")} onChange={set("equipment")} placeholder="e.g. Industrial Bakery Oven X100" />
              </Field>
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
            {approve.isPending ? "Creating order…" : "Approve & Create Order"}
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
export function NewQuoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [service, setService] = useState("express");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCustomer(null);
      setService("express");
      setDescription("");
      setOrigin("");
      setDestination("");
      setError(null);
    }
  }, [open]);
  const create = useOrderMutation(
    () => quotesApi.create({ customer_id: customer!.id, service_type: service, description, origin, destination }),
    { success: (q) => `Quotation ${(q as Quote).reference} recorded`, onSuccess: onClose, onError: (e) => setError(errorText(e)) },
  );
  const submit = () => {
    if (!customer) return setError("Choose or register the customer.");
    if (!description.trim()) return setError("Describe what the customer needs.");
    create.mutate(undefined);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Quotation Request"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={create.isPending}>Save Request</Button>
          <Button variant="muted" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Customer" required>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </Field>
        <Field label="Service Type" required htmlFor="nq-service">
          <Select id="nq-service" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="express">Express Delivery</option>
            <option value="international">International Order</option>
            <option value="equipment">Equipment Support</option>
          </Select>
        </Field>
        <Field label="Description" required htmlFor="nq-desc">
          <Textarea id="nq-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does the customer need?" />
        </Field>
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
