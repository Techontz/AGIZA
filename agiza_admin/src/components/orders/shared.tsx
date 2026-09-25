"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, User, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { ApiError } from "@/lib/api/client";
import {
  customersApi,
  orderKeys,
  type Assignee,
  type Customer,
  type HistoryEntry,
  type Transition,
} from "@/lib/api/services/orders";
import { formatDateTime, formatTSh } from "@/lib/format";

/* ------------------------------------------------------------ permissions */

export function useOrderAccess() {
  const { data: me } = useMe();
  return {
    canEdit: can(me, "orders", "edit"),
    canManage: can(me, "orders", "manage"),
    canPay: can(me, "finance", "edit") || can(me, "orders", "manage"),
    canQuote: can(me, "intake_quotes", "edit"),
    canApprove: can(me, "intake_quotes", "edit") && can(me, "orders", "edit"),
  };
}

/* -------------------------------------------------------------- mutations */

/** Run a workflow call; refresh every order/quote query; toast the outcome. */
export function useOrderMutation<V, R = unknown>(
  fn: (vars: V) => Promise<R>,
  opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; onError?: (e: unknown) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: orderKeys.all });
      qc.invalidateQueries({ queryKey: orderKeys.quotes });
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (err) => {
      if (opts.onError) opts.onError(err);
      else toast.error(errorText(err));
    },
  });
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = Object.values(err.fieldErrors);
    return fields.length ? fields.join(" ") : err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

/* ---------------------------------------------------------------- history */

/** Numbered status history (design: International "Status History"). */
export function StatusHistoryList({ entries, loading }: { entries?: HistoryEntry[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!entries?.length) return <p className="text-sm text-gray-500">No status changes yet.</p>;
  return (
    <div className="space-y-3">
      {entries.map((h, index) => (
        <div key={h.id} className="flex gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex-shrink-0">
            <div className="size-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {index + 1}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-medium text-gray-900">
                {h.from_status && h.from_status !== h.to_status ? `${h.from_status_display} → ` : ""}
                {h.to_status_display}
              </span>
              <span className="text-xs text-gray-500">by {h.changed_by?.full_name ?? "System"}</span>
            </div>
            <p className="text-sm text-gray-600">{formatDateTime(h.created_at)}</p>
            {h.note && <p className="text-sm text-gray-700 mt-1 italic">{h.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- payment */

export function PaymentDialog({
  open,
  onClose,
  due,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  due: string | null;
  onSubmit: (data: Record<string, unknown>) => void;
  pending?: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("mobile_money");
  const [kind, setKind] = useState("balance");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setAmount(due && Number(due) > 0 ? String(Number(due)) : "");
      setReference("");
      setError(null);
    }
  }, [open, due]);
  const submit = () => {
    if (!(Number(amount) > 0)) return setError("Enter an amount greater than zero.");
    if (due !== null && Number(amount) > Number(due)) return setError(`The outstanding balance is ${formatTSh(due)}.`);
    onSubmit({ amount, method, kind, reference });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      size="md"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={pending}>
            Record Payment
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {due !== null && <p className="text-sm text-gray-600">Outstanding balance: <strong>{formatTSh(due)}</strong></p>}
        <Field label="Amount (TSh)" required error={error ?? undefined} htmlFor="pay-amount">
          <Input id="pay-amount" type="number" min="0" step="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Method" htmlFor="pay-method">
            <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Type" htmlFor="pay-kind">
            <Select id="pay-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="balance">Balance / Full</option>
              <option value="advance">Advance</option>
              <option value="installment">Installment</option>
            </Select>
          </Field>
        </div>
        <Field label="Receipt / transaction reference" htmlFor="pay-ref">
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MPESA QFT7X2" />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------- transition */

export function TransitionDialog({
  open,
  onClose,
  options,
  current,
  onSubmit,
  pending,
  canCancel,
}: {
  open: boolean;
  onClose: () => void;
  options: Transition[];
  current: string;
  onSubmit: (status: string, note: string) => void;
  pending?: boolean;
  canCancel: boolean;
}) {
  const choices = options.filter((o) => o.value !== "cancelled" || canCancel);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) {
      setStatus(choices[0]?.value ?? "");
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update Status"
      size="md"
      footer={
        <>
          <Button className="flex-1" onClick={() => onSubmit(status, note)} loading={pending} disabled={!status}>
            Update Status
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Current status: <strong>{current}</strong>
        </p>
        {choices.length === 0 ? (
          <p className="text-sm text-gray-500">No further status changes are possible from here.</p>
        ) : (
          <Field label="New status" required htmlFor="tr-status">
            <Select id="tr-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {choices.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Note (optional)" htmlFor="tr-note">
          <Textarea id="tr-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for the history..." />
        </Field>
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- assign */

export function AssignDialog({
  open,
  onClose,
  title,
  people,
  currentId,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  people?: Assignee[];
  currentId?: number | null;
  onSubmit: (userId: number) => void;
  pending?: boolean;
}) {
  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    if (open) setSelected(currentId ? String(currentId) : "");
  }, [open, currentId]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button className="flex-1" onClick={() => onSubmit(Number(selected))} loading={pending} disabled={!selected}>
            Assign
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      {people && people.length === 0 ? (
        <p className="text-sm text-gray-500">No eligible staff found. Add them under People.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto" role="radiogroup">
          {(people ?? []).map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selected === String(p.id) ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input type="radio" name="assignee" value={p.id} checked={selected === String(p.id)} onChange={(e) => setSelected(e.target.value)} className="text-blue-600" />
              <div className="size-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                {p.full_name.charAt(0)}
              </div>
              <span className="text-sm font-medium text-gray-900">{p.full_name}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------- customer picker */

/** Search existing customers or register a new one (name + phone). */
export function CustomerPicker({
  value,
  onChange,
  error,
}: {
  value: Customer | null;
  onChange: (c: Customer | null) => void;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const results = useQuery({
    queryKey: ["customers", "search", debounced],
    queryFn: () => customersApi.search(debounced),
    enabled: debounced.trim().length >= 2 && !value,
  });
  const create = useMutation({
    mutationFn: () => customersApi.create({ full_name: name.trim(), phone: phone.trim() }),
    onSuccess: (c) => {
      onChange(c);
      setCreating(false);
      toast.success(`Customer ${c.full_name} registered`);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
        <div className="flex items-center gap-2 min-w-0">
          <User className="size-4 text-gray-400" />
          <span className="font-medium text-gray-900 truncate">{value.full_name}</span>
          <span className="text-xs text-gray-500">{value.phone || value.email}</span>
        </div>
        <button type="button" onClick={() => onChange(null)} className="p-1 rounded hover:bg-gray-200" aria-label="Change customer">
          <X className="size-4 text-gray-500" />
        </button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New customer name" />
          <Input placeholder="Phone, e.g. +255 712 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="New customer phone" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim() || !phone.trim()}>
            <UserPlus className="size-4" /> Register customer
          </Button>
          <Button size="sm" variant="muted" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search customer by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search customer"
          invalid={Boolean(error)}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {debounced.trim().length >= 2 && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {results.isPending ? (
            <p className="px-3 py-2 text-sm text-gray-400">Searching…</p>
          ) : results.data?.results.length ? (
            results.data.results.map((c) => (
              <button key={c.id} type="button" onClick={() => onChange(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-900">{c.full_name}</span>
                <span className="text-xs text-gray-500 ml-2">{c.phone || c.email}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-gray-500">No customers match “{debounced}”.</p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setCreating(true);
          setName(search);
        }}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        <Plus className="size-4" /> New customer
      </button>
    </div>
  );
}
