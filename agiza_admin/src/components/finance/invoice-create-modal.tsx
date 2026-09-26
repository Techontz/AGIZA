"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CustomerPicker } from "@/components/orders/shared";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import { financeApi, type Invoice, type InvoiceCreate, type InvoiceSource, type OrderPayment } from "@/lib/api/services/finance";
import { quotesApi, type Customer } from "@/lib/api/services/orders";
import { cn } from "@/lib/cn";
import { formatTSh } from "@/lib/format";

import { FinanceOrderPicker } from "./order-picker";
import { DialogFooter, FINANCE_INVALIDATE, FormAlert, mergedErrors, parseAmount, todayInput } from "./shared";

interface Line {
  key: number;
  description: string;
  quantity: string;
  unit_price: string;
}

const TYPES: { value: InvoiceSource; title: string; hint: string }[] = [
  { value: "quote", title: "From Quotation", hint: "Create from existing quote" },
  { value: "order", title: "From Order", hint: "Bill an existing order" },
  { value: "manual", title: "New Invoice", hint: "Create completely new" },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function InvoiceCreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (inv: Invoice) => void }) {
  const nextKey = useRef(1);
  const newLine = (): Line => ({ key: nextKey.current++, description: "", quantity: "1", unit_price: "" });

  const [type, setType] = useState<InvoiceSource>("quote");
  const [quoteId, setQuoteId] = useState("");
  const [order, setOrder] = useState<OrderPayment | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setType("quote");
      setQuoteId("");
      setOrder(null);
      setCustomer(null);
      setLines([{ key: 0, description: "", quantity: "1", unit_price: "" }]);
      setDueDate("");
      setTaxRate("0");
      setNotes("");
      setError(null);
      setLocal({});
    }
  }, [open]);

  const quotes = useQuery({
    queryKey: ["quotes", "priced", "invoice-picker"],
    queryFn: () => quotesApi.list({ status: "waiting_reply,answered,approved", page_size: 50 }),
    enabled: open && type === "quote",
    select: (r) => r.results.filter((q) => q.quoted_amount !== null),
  });
  const quote = quotes.data?.find((q) => String(q.id) === quoteId) ?? null;

  const create = useApiMutation((body: InvoiceCreate) => financeApi.invoices.create(body), {
    invalidate: FINANCE_INVALIDATE,
    success: (inv) => `Invoice ${inv.reference} created`,
    onSuccess: onCreated,
    onError: setError,
  });

  const rate = parseAmount(taxRate) ?? 0;
  const subtotal =
    type === "quote"
      ? Number(quote?.quoted_amount ?? 0)
      : type === "order"
        ? Number(order?.figures.total ?? 0)
        : round2(lines.reduce((s, l) => s + (parseAmount(l.quantity) ?? 0) * (parseAmount(l.unit_price) ?? 0), 0));
  const tax = round2((subtotal * rate) / 100);
  const total = round2(subtotal + tax);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    const errs: Record<string, string> = {};
    const r = parseAmount(taxRate);
    if (r === null || r > 100) errs.tax_rate = "Enter a VAT rate between 0 and 100.";
    if (dueDate && dueDate < todayInput()) errs.due_date = "The due date can't be in the past.";
    const body: InvoiceCreate = { source: type, due_date: dueDate || null, tax_rate: String(r ?? 0), notes: notes.trim() };
    if (type === "quote") {
      if (!quote) errs.quote = "Choose a quotation.";
      else body.quote = quote.id;
    } else if (type === "order") {
      if (!order) errs.order = "Choose an order.";
      else if (order.figures.total === null) errs.order = `${order.reference} has no price yet.`;
      else body.order = order.id;
    } else {
      if (!customer) errs.customer = "Choose the customer.";
      else body.customer = customer.id;
      const filled = lines.filter((l) => l.description.trim() || l.unit_price.trim());
      if (filled.length === 0) errs.items = "Add at least one line.";
      for (const l of filled) {
        const q = parseAmount(l.quantity);
        if (!l.description.trim()) errs.items = "Every line needs a description.";
        else if (q === null || q <= 0) errs.items = "Quantities must be greater than zero.";
        else if (parseAmount(l.unit_price) === null) errs.items = "Enter a unit price for every line.";
      }
      body.items = filled.map((l) => ({
        description: l.description.trim(),
        quantity: String(parseAmount(l.quantity) ?? 1),
        unit_price: String(parseAmount(l.unit_price) ?? 0),
      }));
    }
    setLocal(errs);
    if (Object.keys(errs).length) return;
    setError(null);
    create.mutate(body);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Invoice"
      size="2xl"
      footer={<DialogFooter label="Create Invoice" onSubmit={submit} onClose={onClose} pending={create.isPending} />}
    >
      <div className="space-y-4">
        <div>
          <p className="block text-sm font-semibold text-gray-700 mb-2" id="inv-type-label">Invoice Type</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" role="radiogroup" aria-labelledby="inv-type-label">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={type === t.value}
                onClick={() => {
                  setType(t.value);
                  setLocal({});
                  setError(null);
                }}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all text-left sm:text-center",
                  type === t.value ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-300",
                )}
              >
                <p className="font-semibold text-gray-900">{t.title}</p>
                <p className="text-sm text-gray-600">{t.hint}</p>
              </button>
            ))}
          </div>
        </div>

        {type === "quote" && (
          <Field label="Select Quotation" required htmlFor="inv-quote" error={fe.quote}>
            <Select id="inv-quote" value={quoteId} onChange={(e) => setQuoteId(e.target.value)} disabled={quotes.isPending || quotes.isError}>
              <option value="">
                {quotes.isPending ? "Loading quotations…" : quotes.data?.length ? "Select a priced quotation" : "No priced quotations"}
              </option>
              {quotes.data?.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.reference} - {q.customer.full_name} ({formatTSh(q.quoted_amount)})
                </option>
              ))}
            </Select>
            {quotes.isError && <p className="text-xs text-red-600 mt-1">{errorText(quotes.error)}</p>}
            {quote && (
              <div className="mt-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="font-medium text-gray-900">{quote.service_type_display} · {quote.status_display}</p>
                <p className="line-clamp-2">{quote.description}</p>
              </div>
            )}
          </Field>
        )}

        {type === "order" && (
          <Field label="Select Order" required htmlFor="inv-order" error={undefined}>
            <FinanceOrderPicker id="inv-order" value={order} onChange={setOrder} error={fe.order} />
          </Field>
        )}

        {type === "manual" && (
          <>
            <Field label="Customer" required>
              <CustomerPicker value={customer} onChange={setCustomer} error={fe.customer} />
            </Field>
            <div>
              <p className="block text-sm font-semibold text-gray-700 mb-2">Line Items <span className="text-red-600">*</span></p>
              <div className="space-y-3">
                {lines.map((l, i) => (
                  <div key={l.key} className="grid grid-cols-12 gap-2 items-start">
                    <Input
                      className="col-span-12 sm:col-span-6"
                      placeholder="Description"
                      aria-label={`Line ${i + 1} description`}
                      value={l.description}
                      maxLength={255}
                      onChange={(e) => setLine(l.key, { description: e.target.value })}
                    />
                    <Input
                      className="col-span-3 sm:col-span-2"
                      inputMode="decimal"
                      placeholder="Qty"
                      aria-label={`Line ${i + 1} quantity`}
                      value={l.quantity}
                      onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                    />
                    <Input
                      className="col-span-7 sm:col-span-3"
                      inputMode="decimal"
                      placeholder="Unit price"
                      aria-label={`Line ${i + 1} unit price`}
                      value={l.unit_price}
                      onChange={(e) => setLine(l.key, { unit_price: e.target.value })}
                    />
                    <button
                      type="button"
                      className="col-span-2 sm:col-span-1 p-2 mt-0.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent flex justify-center"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              {fe.items && <p className="text-xs text-red-600 mt-1">{fe.items}</p>}
              <button
                type="button"
                onClick={() => setLines((ls) => [...ls, newLine()])}
                className="mt-3 text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1"
              >
                <Plus className="size-4" /> Add line
              </button>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Due Date" htmlFor="inv-due" error={fe.due_date} hint="Optional">
            <Input id="inv-due" type="date" min={todayInput()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="VAT (%)" htmlFor="inv-vat" error={fe.tax_rate} hint="0 = no VAT line">
            <Input id="inv-vat" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} invalid={Boolean(fe.tax_rate)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="inv-notes" error={fe.notes}>
          <Textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, bank details..." />
        </Field>

        <div className="border-t border-gray-200 pt-4 space-y-2 text-sm" aria-live="polite">
          <div className="flex justify-between">
            <span className="text-gray-700">Subtotal:</span>
            <span className="font-semibold">{formatTSh(subtotal)}</span>
          </div>
          {rate > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-700">VAT {rate}%:</span>
              <span className="font-semibold">{formatTSh(tax)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t text-base">
            <span className="font-semibold text-gray-900">Total:</span>
            <span className="font-bold text-gray-900">{formatTSh(total)}</span>
          </div>
          {type === "order" && <p className="text-xs text-gray-500">Order lines are copied from the order when the invoice is created.</p>}
        </div>

        <FormAlert error={error} shown={["quote", "order", "customer", "items", "due_date", "tax_rate", "notes"]} />
      </div>
    </Modal>
  );
}
