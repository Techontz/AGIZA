"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, CreditCard, ExternalLink, Globe, MapPin, Package2, Pencil, PlayCircle, Receipt, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FormAlert, fromLocalInput, mergedErrors } from "@/components/deliveries/form-helpers";
import { OrderPickups } from "@/components/deliveries/pickups";
import { PaymentDialog, StatusHistoryList, useOrderAccess } from "@/components/orders/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText } from "@/lib/api/errors";
import { shopOrderKeys, shopOrdersApi, type ShopOrder, type ShopStatus } from "@/lib/api/services/shop-orders";
import { formatDateTime, formatTSh } from "@/lib/format";

import { OrderSellers } from "./sellers-block";
import { SHOP_INVALIDATE } from "./shared";

type Action = "process" | "ship" | "cancel" | "pay" | "fee" | null;

/** Plain status moves through the import stages: the label for each target status. */
const IMPORT_VERB: Partial<Record<ShopStatus, string>> = {
  ordered_from_supplier: "Ordered from Supplier",
  at_origin_warehouse: "At Warehouse Abroad",
  shipping_to_destination: "Shipping to Tanzania",
  clearance: "Customs Clearance",
  arrived: "Arrived in Tanzania",
};

const box = "bg-white p-4 rounded border border-gray-200";

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 font-semibold pt-2 border-t border-gray-200" : "flex justify-between gap-4 text-sm"}>
      <span className={strong ? "text-gray-900" : "text-gray-600"}>{label}</span>
      <span className="text-gray-900 text-right">{children}</span>
    </div>
  );
}

/** The design's expanded "Details" row, plus the workflow actions and history. */
export function ShopOrderDetails({ order: o }: { order: ShopOrder }) {
  const { canEdit, canManage, canPay } = useOrderAccess();
  const [action, setAction] = useState<Action>(null);
  const [stage, setStage] = useState<ShopStatus | null>(null);
  const close = () => setAction(null);

  const history = useQuery({ queryKey: shopOrderKeys.sub(o.id, "history"), queryFn: () => shopOrdersApi.history(o.id) });
  const payments = useQuery({ queryKey: shopOrderKeys.sub(o.id, "payments"), queryFn: () => shopOrdersApi.payments(o.id) });

  const pay = useApiMutation((data: Record<string, unknown>) => shopOrdersApi.recordPayment(o.id, data), {
    invalidate: SHOP_INVALIDATE,
    success: `Payment recorded on ${o.reference}`,
    onSuccess: close,
  });

  const canProcess = canEdit && o.allowed_transitions.some((t) => t.value === "processing");
  const feePending = o.details.delivery_fee_pending && o.status !== "cancelled";
  const canShip = canEdit && (o.status === "processing" || o.status === "arrived") && !feePending;
  // Cancelling is possible until the goods leave for Tanzania (or the local order ships).
  const canCancel = canManage && ["pending", "processing", "ordered_from_supplier", "at_origin_warehouse"].includes(o.status);
  // Imported items: the next stages of the trip from abroad (offered by the server only for such orders).
  const importMoves = canEdit ? o.allowed_transitions.filter((t) => t.value in IMPORT_VERB) : [];
  const due = o.payment.due !== null ? Number(o.payment.due) : null;
  const canRecord = canPay && o.status !== "cancelled" && (due === null || due > 0);
  const email = o.details.customer_email || o.customer.email;

  return (
    <div className="space-y-6">
      {feePending && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-orange-300 bg-orange-50 p-4" role="alert">
          <AlertTriangle className="size-5 flex-shrink-0 text-orange-600 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-orange-900">Needs manual delivery cost</p>
            <p className="text-sm text-orange-900 mt-1">
              The Shipping Engine couldn&apos;t price delivery to {o.details.full_address || "this address"}
              {o.details.shipping_method && ` by ${o.details.shipping_method.name}`}. The customer placed the order without it and
              can&apos;t pay until you set the delivery cost. They are notified when you do.
            </p>
            {o.details.delivery_issue && (
              <div className="mt-3 rounded-md border border-orange-200 bg-white/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">What&apos;s missing</p>
                <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{o.details.delivery_issue}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Fix it for the next customers in the Shipping Engine:{" "}
                  <Link href="/shipping-engine/routes" className="font-medium text-blue-700 hover:underline">Routes</Link>
                  {" · "}
                  <Link href="/shipping-engine/rules" className="font-medium text-blue-700 hover:underline">Rules</Link>
                  {" · "}
                  <Link href="/shipping-engine/test-rate" className="font-medium text-blue-700 hover:underline">Test a rate</Link>
                </p>
              </div>
            )}
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setAction("fee")}>
              <Receipt className="size-4" /> Set Delivery Cost
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Order Items</h4>
          <div className="space-y-2">
            {o.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center gap-4 bg-white p-3 rounded border border-gray-200">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {item.product_name}
                    {item.variant_name && <span className="text-gray-600 font-normal"> — {item.variant_name}</span>}
                  </p>
                  <p className="text-sm text-gray-600">
                    Quantity: {item.quantity} × {formatTSh(item.unit_price)}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                </div>
                <p className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(item.line_total)}</p>
              </div>
            ))}
          </div>
          {(() => {
            // A marketplace order can be collected from several places (AGIZA warehouses, vendors' premises).
            const pickups = [...new Set(o.items.map((i) => i.warehouse).filter(Boolean))];
            const places = pickups.length ? pickups : o.details.fulfillment_warehouse ? [o.details.fulfillment_warehouse] : [];
            return places.length ? (
              <p className="text-xs text-gray-500 mt-2">
                {places.length > 1 ? "Collected from " : "Fulfilled from "}
                <span className="font-medium text-gray-700">{places.join(" · ")}</span>
              </p>
            ) : null;
          })()}
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Shipping Address</h4>
          <div className={box}>
            <div className="flex items-start gap-2">
              <MapPin className="size-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-gray-900">{o.details.full_address}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {o.customer.full_name}
                  {o.customer.phone && ` · ${o.customer.phone}`}
                  {email && ` · ${email}`}
                </p>
                {o.details.shipping_method && (
                  <p className="text-sm text-gray-600 mt-1">
                    Delivery: <span className="font-medium text-gray-900">{o.details.shipping_method.name}</span>
                    {o.details.estimated_delivery && ` · ${o.details.estimated_delivery}`}
                  </p>
                )}
                {o.details.location && (
                  <a
                    className="inline-block text-sm text-blue-600 hover:underline mt-1"
                    href={`https://www.google.com/maps?q=${o.details.location.latitude},${o.details.location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open pinned location in Maps
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <h4 className="font-semibold text-gray-900 mb-2">Order Summary</h4>
            <div className={`${box} space-y-2`}>
              <Row label="Subtotal:">{formatTSh(o.details.subtotal)}</Row>
              <Row label="Delivery fee:">
                {feePending ? (
                  <span className="text-orange-700 font-medium">
                    To be set{Number(o.details.delivery_fee) > 0 && ` (+ ${formatTSh(o.details.delivery_fee)} import shipping)`}
                  </span>
                ) : (
                  formatTSh(o.details.delivery_fee)
                )}
              </Row>
              <Row label="Total:" strong>
                {formatTSh(o.total_amount)}
              </Row>
              <Row label="Paid:">{formatTSh(o.payment.paid)}</Row>
              {due !== null && due > 0 && o.status !== "cancelled" && (
                <Row label="Balance due:">
                  <span className="text-orange-700 font-medium">{formatTSh(due)}</span>
                </Row>
              )}
              <Row label="Channel:">{o.details.channel_display}</Row>
              {o.details.payment_preference_display && (
                <Row label="Customer pays:">{o.details.payment_preference_display}</Row>
              )}
            </div>
          </div>
        </div>
      </div>

      <OrderSellers orderId={o.id} />
      <OrderPickups orderId={o.id} />

      {(canProcess || canShip || canCancel || canRecord || importMoves.length > 0 || o.delivery) && (
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-gray-200">
          {canProcess && (
            <Button size="sm" onClick={() => setAction("process")}>
              <PlayCircle className="size-4" /> Mark Processing
            </Button>
          )}
          {importMoves.map((t) => (
            <Button key={t.value} size="sm" variant="outline" onClick={() => setStage(t.value as ShopStatus)}>
              <Globe className="size-4" /> {t.label}
            </Button>
          ))}
          {canShip && (
            <Button size="sm" variant="success" onClick={() => setAction("ship")}>
              <Truck className="size-4" /> Ship Order
            </Button>
          )}
          {canRecord && (
            <Button size="sm" variant="outline" onClick={() => setAction("pay")}>
              <CreditCard className="size-4" /> Record Payment
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => setAction("cancel")}>
              <Ban className="size-4" /> Cancel Order
            </Button>
          )}
          {o.delivery && (
            <Link
              href={`/deliveries?search=${encodeURIComponent(o.delivery.reference)}`}
              className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <Truck className="size-4" />
              Delivery {o.delivery.reference} · {o.delivery.status_display}
              <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold text-gray-900 mb-3">Status History</h4>
          <div className={box}>
            {history.isError ? (
              <InlineError error={history.error} retry={() => history.refetch()} />
            ) : (
              <StatusHistoryList entries={history.data} loading={history.isPending} />
            )}
          </div>
        </div>
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold text-gray-900 mb-3">Payments</h4>
            <div className={box}>
              {payments.isPending ? (
                <div className="space-y-2" aria-hidden>
                  {[0, 1].map((i) => (
                    <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : payments.isError ? (
                <InlineError error={payments.error} retry={() => payments.refetch()} />
              ) : payments.data.length === 0 ? (
                <p className="text-sm text-gray-500">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {payments.data.map((p) => (
                    <li key={p.id} className="py-2 first:pt-0 last:pb-0 flex justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {p.method_display} · {p.kind_display}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(p.paid_at)}
                          {p.reference && ` · ${p.reference}`}
                          {p.recorded_by && ` · ${p.recorded_by.full_name}`}
                        </p>
                      </div>
                      <p className="font-semibold text-gray-900 whitespace-nowrap">{formatTSh(p.amount)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <NotesEditor order={o} editable={canEdit} />
        </div>
      </div>

      <ProcessDialog order={o} open={action === "process"} onClose={close} />
      <StageDialog order={o} target={stage} onClose={() => setStage(null)} />
      <ShipDialog order={o} open={action === "ship"} onClose={close} />
      <CancelDialog order={o} open={action === "cancel"} onClose={close} />
      <DeliveryFeeDialog order={o} open={action === "fee"} onClose={close} />
      <PaymentDialog open={action === "pay"} onClose={close} due={o.payment.due} pending={pay.isPending} onSubmit={(data) => pay.mutate(data)} />
    </div>
  );
}

function InlineError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <p className="text-sm text-red-600" role="alert">
      {errorText(error)}{" "}
      <button type="button" onClick={retry} className="font-medium text-blue-600 hover:text-blue-800">
        Retry
      </button>
    </p>
  );
}

/* ---------------------------------------------------------------- notes */

function NotesEditor({ order: o, editable }: { order: ShopOrder; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(o.notes);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!editing) setNotes(o.notes);
  }, [o.notes, editing]);
  const save = useApiMutation(() => shopOrdersApi.updateNotes(o.id, notes.trim()), {
    invalidate: SHOP_INVALIDATE,
    success: "Notes saved",
    onSuccess: () => {
      setEditing(false);
      setError(null);
    },
    onError: setError,
  });
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">Notes</h4>
        {editable && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800" aria-label={`Edit notes for ${o.reference}`}>
            <Pencil className="size-3.5" /> Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Order notes" placeholder="Internal notes..." />
          <FormAlert error={error} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate(undefined)} loading={save.isPending}>
              Save Notes
            </Button>
            <Button
              size="sm"
              variant="muted"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={save.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : o.notes ? (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-gray-800 whitespace-pre-line">{o.notes}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No notes.</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- dialogs */

function ProcessDialog({ order: o, open, onClose }: { order: ShopOrder; open: boolean; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);
  const move = useApiMutation(() => shopOrdersApi.transition(o.id, "processing", note.trim()), {
    invalidate: SHOP_INVALIDATE,
    success: (r) => `${r.reference} is now processing`,
    onSuccess: onClose,
    onError: setError,
  });
  return (
    <ConfirmDialog
      open={open}
      title={`Mark Processing — ${o.reference}`}
      message="Start picking and packing this order. Its stock stays reserved until it ships."
      confirmLabel="Mark Processing"
      pending={move.isPending}
      onConfirm={() => move.mutate(undefined)}
      onClose={onClose}
    >
      <div className="mt-4 space-y-3">
        <Field label="Note (optional)" htmlFor={`proc-note-${o.id}`}>
          <Textarea id={`proc-note-${o.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for the history..." />
        </Field>
        <FormAlert error={error} />
      </div>
    </ConfirmDialog>
  );
}

function StageDialog({ order: o, target, onClose }: { order: ShopOrder; target: ShopStatus | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (target) {
      setNote("");
      setError(null);
    }
  }, [target]);
  const label = target ? IMPORT_VERB[target] ?? target : "";
  const move = useApiMutation(() => shopOrdersApi.transition(o.id, target as string, note.trim()), {
    invalidate: SHOP_INVALIDATE,
    success: (r) => `${r.reference}: ${label}`,
    onSuccess: onClose,
    onError: setError,
  });
  return (
    <ConfirmDialog
      open={target !== null}
      title={`${label} — ${o.reference}`}
      message={`Move this order to "${label}". The customer sees it on their order tracking.`}
      confirmLabel="Update Status"
      pending={move.isPending}
      onConfirm={() => move.mutate(undefined)}
      onClose={onClose}
    >
      <div className="mt-4 space-y-3">
        <Field label="Note (optional)" htmlFor={`stage-note-${o.id}`}>
          <Textarea id={`stage-note-${o.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. container number, vessel, expected arrival..." />
        </Field>
        <FormAlert error={error} />
      </div>
    </ConfirmDialog>
  );
}

function ShipDialog({ order: o, open, onClose }: { order: ShopOrder; open: boolean; onClose: () => void }) {
  const drivers = useQuery({ queryKey: shopOrderKeys.drivers, queryFn: shopOrdersApi.drivers, enabled: open, staleTime: 60_000 });
  const [driver, setDriver] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setDriver("");
      setScheduled("");
      setNote("");
      setError(null);
    }
  }, [open]);
  const ship = useApiMutation(
    () => shopOrdersApi.ship(o.id, { driver: driver ? Number(driver) : null, scheduled_at: fromLocalInput(scheduled), note: note.trim() }),
    {
      invalidate: SHOP_INVALIDATE,
      success: (r) => (r.delivery ? `${r.reference} shipped — delivery ${r.delivery.reference} opened` : `${r.reference} shipped`),
      onSuccess: onClose,
      onError: setError,
    },
  );
  const fe = mergedErrors(error, {});
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ship Order — ${o.reference}`}
      size="lg"
      footer={
        <>
          <Button variant="success" className="flex-1" onClick={() => ship.mutate(undefined)} loading={ship.isPending}>
            <Truck className="size-4" /> Ship Order
          </Button>
          <Button variant="muted" onClick={onClose} disabled={ship.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Package2 className="size-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900">
            Stock for {o.items.length} line{o.items.length === 1 ? "" : "s"} leaves {o.details.fulfillment_warehouse ?? "the warehouse"} and a delivery to{" "}
            {o.details.full_address} is opened.
          </p>
        </div>
        <Field label="Driver" htmlFor={`ship-driver-${o.id}`} error={fe.driver} hint="Optional — you can assign one later in Deliveries.">
          <Select id={`ship-driver-${o.id}`} value={driver} onChange={(e) => setDriver(e.target.value)} disabled={drivers.isPending}>
            <option value="">{drivers.isPending ? "Loading drivers…" : "Assign later"}</option>
            {drivers.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        </Field>
        {drivers.isError && <p className="text-xs text-red-600">Couldn&apos;t load drivers: {errorText(drivers.error)}</p>}
        <Field label="Scheduled date & time" htmlFor={`ship-sched-${o.id}`} error={fe.scheduled_at} hint="Optional">
          <Input id={`ship-sched-${o.id}`} type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor={`ship-note-${o.id}`} error={fe.note}>
          <Textarea id={`ship-note-${o.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fragile — handle with care" />
        </Field>
        <FormAlert error={error} shown={["driver", "scheduled_at", "note"]} />
      </div>
    </Modal>
  );
}

function CancelDialog({ order: o, open, onClose }: { order: ShopOrder; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setLocal({});
    }
  }, [open]);
  const cancel = useApiMutation(() => shopOrdersApi.cancel(o.id, reason.trim()), {
    invalidate: SHOP_INVALIDATE,
    success: (r) => `${r.reference} cancelled — reserved stock released`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (!reason.trim()) return setLocal({ reason: "Give the reason for cancelling." });
    setLocal({});
    cancel.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  return (
    <ConfirmDialog
      open={open}
      title={`Cancel Order — ${o.reference}`}
      message={
        <>
          The order is cancelled and its reserved stock goes back on sale. This can&apos;t be undone.
          {Number(o.payment.paid) > 0 && <span className="block mt-2 text-sm text-orange-700">{formatTSh(o.payment.paid)} has been paid — arrange the refund in Finance.</span>}
        </>
      }
      confirmLabel="Cancel Order"
      tone="danger"
      pending={cancel.isPending}
      onConfirm={submit}
      onClose={onClose}
    >
      <div className="mt-4 space-y-3">
        <Field label="Reason" required htmlFor={`cancel-reason-${o.id}`} error={fe.reason}>
          <Textarea id={`cancel-reason-${o.id}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the order being cancelled?" />
        </Field>
        <FormAlert error={error} shown={["reason"]} />
      </div>
    </ConfirmDialog>
  );
}

/** "Set Delivery Cost" for an order placed while the Shipping Engine had no rule for its address (also used by Intake & Quotes). */
export function DeliveryFeeDialog({ order: o, open, onClose }: { order: ShopOrder; open: boolean; onClose: () => void }) {
  const methods = useQuery({ queryKey: shopOrderKeys.methods, queryFn: shopOrdersApi.methods, enabled: open, staleTime: 60_000 });
  const [fee, setFee] = useState("");
  const [method, setMethod] = useState("");
  const [eta, setEta] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setFee("");
      setMethod(o.details.shipping_method ? String(o.details.shipping_method.id) : "");
      setEta(o.details.estimated_delivery);
      setNote("");
      setError(null);
      setLocal({});
    }
  }, [open, o.details.shipping_method, o.details.estimated_delivery]);
  const save = useApiMutation(
    () =>
      shopOrdersApi.setDeliveryFee(o.id, {
        delivery_fee: fee.trim(),
        shipping_method: method ? Number(method) : null,
        estimated_delivery: eta.trim(),
        note: note.trim(),
      }),
    {
      invalidate: SHOP_INVALIDATE,
      success: (r) => `Delivery cost set on ${r.reference} — the customer can now pay`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const amount = Number(fee);
  const submit = () => {
    if (!fee.trim() || Number.isNaN(amount) || amount < 0) return setLocal({ delivery_fee: "Enter the delivery cost (0 or more)." });
    setLocal({});
    save.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const newTotal = Number(o.total_amount ?? 0) + (Number.isNaN(amount) ? 0 : amount);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set Delivery Cost — ${o.reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={submit} loading={save.isPending}>
            <Receipt className="size-4" /> Set Cost &amp; Notify Customer
          </Button>
          <Button variant="muted" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Delivery to <span className="font-medium text-gray-900">{o.details.full_address}</span>. The amount is added to the order total and the
          customer is told they can pay.
        </p>
        <Field label="Delivery cost (TSh)" required htmlFor={`fee-amount-${o.id}`} error={fe.delivery_fee}>
          <Input id={`fee-amount-${o.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Delivery method" htmlFor={`fee-method-${o.id}`} error={fe.shipping_method} hint="Optional — keeps the customer's choice if unchanged.">
          <Select id={`fee-method-${o.id}`} value={method} onChange={(e) => setMethod(e.target.value)} disabled={methods.isPending}>
            <option value="">{methods.isPending ? "Loading methods…" : "No change"}</option>
            {methods.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        {methods.isError && <p className="text-xs text-red-600">Couldn&apos;t load delivery methods: {errorText(methods.error)}</p>}
        <Field label="Estimated delivery" htmlFor={`fee-eta-${o.id}`} error={fe.estimated_delivery} hint='Optional, e.g. "2–3 days"'>
          <Input id={`fee-eta-${o.id}`} maxLength={60} value={eta} onChange={(e) => setEta(e.target.value)} />
        </Field>
        <Field label="Note for the history (optional)" htmlFor={`fee-note-${o.id}`} error={fe.note}>
          <Textarea id={`fee-note-${o.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bus cargo to Mwanza, quoted by the carrier" />
        </Field>
        <div className="flex justify-between rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <span className="text-gray-600">New order total</span>
          <span className="font-semibold text-gray-900">{formatTSh(newTotal)}</span>
        </div>
        <FormAlert error={error} shown={["delivery_fee", "shipping_method", "estimated_delivery", "note"]} />
      </div>
    </Modal>
  );
}
