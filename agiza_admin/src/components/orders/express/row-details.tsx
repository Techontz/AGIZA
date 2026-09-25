"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Check,
  DollarSign,
  Edit2,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  Package2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { attachmentSrc, orderKeys, ordersApi, type ExpressOrder } from "@/lib/api/services/orders";
import { formatDateTime, formatTSh } from "@/lib/format";

import { AssignDialog, PaymentDialog, StatusHistoryList, useOrderAccess, useOrderMutation } from "../shared";
import { QuoteForm } from "./quote-form";

const SIZES = [
  { id: "small", label: "Small", weight: "Up to 5kg", dims: "30×30×30 cm", icon: "size-12" },
  { id: "medium", label: "Medium", weight: "5kg - 15kg", dims: "50×50×50 cm", icon: "size-16" },
  { id: "large", label: "Large", weight: "Over 15kg", dims: "100×100×100 cm", icon: "size-20" },
] as const;

const STEPS = [
  { id: "picked_up", label: "Picked Up", active: "border-cyan-600 bg-cyan-50 text-cyan-800" },
  { id: "at_agiza_center", label: "At Agiza Center", active: "border-purple-600 bg-purple-50 text-purple-800" },
  { id: "in_transit", label: "In Transit", active: "border-blue-600 bg-blue-50 text-blue-800" },
  { id: "arrived", label: "Arrived", active: "border-indigo-600 bg-indigo-50 text-indigo-800" },
  { id: "delivered", label: "Delivered", active: "border-green-600 bg-green-50 text-green-800" },
] as const;

function Addresses({ order }: { order: ExpressOrder }) {
  const d = order.details;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
          <MapPin className="size-4 text-green-600" />
          Pickup Address
        </div>
        <p className="text-gray-900 ml-6">
          {d.pickup_address}
          {d.pickup_city && `, ${d.pickup_city.name}`}
        </p>
      </div>
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
          <MapPin className="size-4 text-red-600" />
          Delivery Address
        </div>
        <p className="text-gray-900 ml-6">
          {d.delivery_address}
          {d.delivery_city && `, ${d.delivery_city.name}`}
        </p>
      </div>
      {order.notes && (
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <FileText className="size-4 text-blue-600" />
            Additional Notes
          </div>
          <div className="ml-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-800">{order.notes}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoLine({ icon: Icon, color, label, children }: { icon: typeof Calendar; color: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
        <Icon className={cn("size-4", color)} />
        {label}
      </div>
      <div className="text-gray-900 ml-6">{children}</div>
    </div>
  );
}

function HistoryToggle({ order }: { order: ExpressOrder }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: orderKeys.sub("express", order.id, "history"),
    queryFn: () => ordersApi.express.history(order.id),
    enabled: open,
  });
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800">
        <History className="size-4" /> {open ? "Hide status history" : "Show status history"}
      </button>
      {open && (
        <div className="mt-3">
          <StatusHistoryList entries={history.data} loading={history.isPending} />
        </div>
      )}
    </div>
  );
}

function PaymentLine({ order }: { order: ExpressOrder }) {
  const { canPay } = useOrderAccess();
  const [open, setOpen] = useState(false);
  const d = order.details;
  const pay = useOrderMutation((data: Record<string, unknown>) => ordersApi.express.recordPayment(order.id, data), {
    success: "Payment recorded",
    onSuccess: () => setOpen(false),
  });
  if (!d.advance_required && Number(order.payment.paid) === 0) return null;
  const advanceMissing = d.advance_required && Number(order.payment.paid) < Number(d.advance_amount);
  return (
    <InfoLine icon={DollarSign} color="text-green-600" label="Payment">
      <p className="text-sm">
        Paid <strong>{formatTSh(order.payment.paid)}</strong> of {formatTSh(order.total_amount)}
        {d.advance_required && <> · advance required {formatTSh(d.advance_amount)}</>}
      </p>
      {advanceMissing && <p className="text-xs text-orange-700 mt-1">Advance not yet received — a driver can&apos;t be assigned until it is.</p>}
      {canPay && order.payment.due !== null && Number(order.payment.due) > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 text-sm font-medium text-blue-600 hover:text-blue-800">
          Record payment
        </button>
      )}
      <PaymentDialog
        open={open}
        onClose={() => setOpen(false)}
        due={advanceMissing ? String(Number(d.advance_amount) - Number(order.payment.paid)) : order.payment.due}
        onSubmit={(data) => pay.mutate({ ...data, kind: advanceMissing ? "advance" : data.kind })}
        pending={pay.isPending}
      />
    </InfoLine>
  );
}

/* --------------------------------------------------------- waiting quote */
function WaitingQuote({ order }: { order: ExpressOrder }) {
  const { canEdit } = useOrderAccess();
  const [tab, setTab] = useState<"info" | "images" | "size">("info");
  const [showForm, setShowForm] = useState(false);
  const d = order.details;
  const current = d.package_size || d.customer_package_size;
  const images = useQuery({
    queryKey: orderKeys.sub("express", order.id, "attachments"),
    queryFn: () => ordersApi.express.attachments(order.id),
    enabled: tab === "images",
  });
  const setSize = useOrderMutation((size: string) => ordersApi.express.packageSize(order.id, size), { success: "Package size updated" });
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useOrderMutation((file: File) => ordersApi.express.upload(order.id, file), { success: "Photo uploaded" });

  const tabBtn = (id: typeof tab, children: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        "px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap",
        tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900",
      )}
    >
      {children}
    </button>
  );

  return (
    <div>
      <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto no-scrollbar" role="tablist">
        {tabBtn("info", "Order Info")}
        {tabBtn(
          "images",
          <>
            <ImageIcon className="size-4" />
            Images/Photos
            {order.attachments_count > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full size-5 flex items-center justify-center">{order.attachments_count}</span>
            )}
          </>,
        )}
        {tabBtn(
          "size",
          <>
            <Package2 className="size-4" />
            Package Size
            {current && <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">{current}</span>}
          </>,
        )}
      </div>

      {tab === "info" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Addresses order={order} />
            <HistoryToggle order={order} />
          </div>
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-orange-800 font-medium mb-2">Action Required</p>
              <p className="text-sm text-orange-700 mb-4">This order is waiting for a quote. Please review package details and generate a quote.</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium w-full"
                >
                  Generate Quote
                </button>
              )}
            </div>
            {showForm && <QuoteForm order={order} isEditing={false} onDone={() => setShowForm(false)} />}
          </div>
        </div>
      )}

      {tab === "images" && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-4">
            <p className="text-sm text-gray-700">Customer-uploaded package photos:</p>
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  aria-label="Upload package photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload.mutate(f);
                    e.target.value = "";
                  }}
                />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={upload.isPending} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                  <Upload className="size-4" /> {upload.isPending ? "Uploading…" : "Add photo"}
                </button>
              </>
            )}
          </div>
          {images.isPending ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-40 rounded-lg bg-gray-200 animate-pulse" />
              ))}
            </div>
          ) : images.data && images.data.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {images.data.map((img, index) => (
                <div key={img.id} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL */}
                  <img src={attachmentSrc(img)} alt={img.caption || `Package photo ${index + 1}`} className="w-full h-40 object-cover rounded-lg border border-gray-200 shadow-sm" />
                  <button
                    type="button"
                    onClick={() => window.open(attachmentSrc(img), "_blank")}
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-lg flex items-center justify-center"
                  >
                    <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-medium">View Full Size</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-100 rounded-lg">
              <ImageIcon className="size-12 mx-auto mb-2 text-gray-400" />
              <p className="text-gray-600">No images provided by customer</p>
            </div>
          )}
        </div>
      )}

      {tab === "size" && (
        <div>
          <p className="text-sm text-gray-700 mb-2">
            Customer selected package size: <strong className="text-blue-600">{d.customer_package_size ? d.customer_package_size.toUpperCase() : "NOT SPECIFIED"}</strong>
          </p>
          <p className="text-sm text-gray-600 mb-4">You can adjust the package size if needed for accurate quote calculation:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
            {SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={!canEdit || setSize.isPending}
                onClick={() => current !== s.id && setSize.mutate(s.id)}
                aria-pressed={current === s.id}
                className={cn(
                  "p-6 rounded-lg border-2 transition-all disabled:cursor-not-allowed",
                  current === s.id ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300",
                )}
              >
                <div className="flex flex-col items-center">
                  <Package2 className={cn(s.icon, "mb-3", current === s.id ? "text-blue-600" : "text-gray-400")} />
                  <h3 className="font-semibold text-lg mb-1">{s.label}</h3>
                  <p className="text-sm text-gray-600">{s.weight}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.dims}</p>
                </div>
              </button>
            ))}
          </div>
          {d.package_size && d.customer_package_size && d.package_size !== d.customer_package_size && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠ Package size updated to <strong>{d.package_size}</strong> (originally {d.customer_package_size})
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- quoted */
function Quoted({ order }: { order: ExpressOrder }) {
  const { canEdit } = useOrderAccess();
  const [editing, setEditing] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const d = order.details;
  const quoteStatus = order.status as "quoted" | "accepted" | "rejected";
  const setQuoteStatus = useOrderMutation((s: "accepted" | "rejected") => ordersApi.express.quoteStatus(order.id, s), {
    success: (o) => `Quote ${(o as ExpressOrder).status}`,
  });
  const drivers = useQuery({
    queryKey: ["orders", "assignees", "driver"],
    queryFn: () => ordersApi.express.assignees("driver"),
    enabled: assignOpen,
  });
  const assign = useOrderMutation((user: number) => ordersApi.express.assignDriver(order.id, user), {
    success: (o) => `Driver assigned — ${(o as ExpressOrder).reference} is in progress`,
    onSuccess: () => setAssignOpen(false),
  });

  const btn = (id: "quoted" | "accepted" | "rejected", label: string, active: string, Icon: typeof Check) => {
    const isCurrent = quoteStatus === id;
    const reachable = id !== "quoted" && order.allowed_transitions.some((t) => t.value === id);
    return (
      <button
        key={id}
        type="button"
        disabled={!canEdit || isCurrent || !reachable || setQuoteStatus.isPending}
        onClick={() => setQuoteStatus.mutate(id as "accepted" | "rejected")}
        aria-pressed={isCurrent}
        className={cn(
          "p-3 rounded-lg border-2 transition-all text-sm font-medium disabled:cursor-default",
          isCurrent ? active : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:hover:border-gray-200 disabled:text-gray-400",
        )}
      >
        {isCurrent && <Icon className="size-4 mx-auto mb-1" />}
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Addresses order={order} />
        </div>
        <div className="space-y-4">
          {d.estimated_delivery_at && (
            <InfoLine icon={Calendar} color="text-blue-600" label="Estimated Delivery Date">
              {formatDateTime(d.estimated_delivery_at)}
            </InfoLine>
          )}
          {order.total_amount && (
            <InfoLine icon={DollarSign} color="text-green-600" label="Quoted Price">
              <span className="font-semibold">{formatTSh(order.total_amount)}</span>
              {d.quoted_by && <span className="text-xs text-gray-500 ml-2">by {d.quoted_by.full_name}</span>}
            </InfoLine>
          )}
          <PaymentLine order={order} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Quote Status</h4>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {btn("quoted", "Quoted", "border-yellow-600 bg-yellow-50 text-yellow-800", Check)}
          {btn("accepted", "Accepted", "border-green-600 bg-green-50 text-green-800", Check)}
          {btn("rejected", "Rejected", "border-red-600 bg-red-50 text-red-800", X)}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Edit2 className="size-4" />
              Edit Quote
            </button>
            {quoteStatus === "accepted" && (
              <button type="button" onClick={() => setAssignOpen(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium">
                Assign Driver
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4">
          <QuoteForm order={order} isEditing onDone={() => setEditing(false)} />
        </div>
      )}
      <HistoryToggle order={order} />
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Assign Driver — ${order.reference}`}
        people={drivers.data}
        onSubmit={(id) => assign.mutate(id)}
        pending={assign.isPending}
      />
    </div>
  );
}

/* ---------------------------------------------------------- in progress */
function InProgress({ order }: { order: ExpressOrder }) {
  const { canEdit } = useOrderAccess();
  const d = order.details;
  const [assignOpen, setAssignOpen] = useState(false);
  const move = useOrderMutation((status: string) => ordersApi.express.transition(order.id, status), {
    success: (o) => `${(o as ExpressOrder).reference}: ${(o as ExpressOrder).status_display}`,
  });
  const drivers = useQuery({ queryKey: ["orders", "assignees", "driver"], queryFn: () => ordersApi.express.assignees("driver"), enabled: assignOpen });
  const assign = useOrderMutation((user: number) => ordersApi.express.assignDriver(order.id, user), {
    success: "Driver changed",
    onSuccess: () => setAssignOpen(false),
  });
  const allowed = new Set(order.allowed_transitions.map((t) => t.value));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Addresses order={order} />
        </div>
        <div className="space-y-4">
          {d.estimated_delivery_at && (
            <InfoLine icon={Calendar} color="text-blue-600" label="Estimated Delivery Date">
              {formatDateTime(d.estimated_delivery_at)}
            </InfoLine>
          )}
          {d.driver && (
            <InfoLine icon={Truck} color="text-purple-600" label="Assigned Driver">
              {d.driver.full_name}
              {canEdit && order.status !== "delivered" && (
                <button type="button" onClick={() => setAssignOpen(true)} className="ml-3 text-sm font-medium text-blue-600 hover:text-blue-800">
                  Change
                </button>
              )}
            </InfoLine>
          )}
          <PaymentLine order={order} />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-3">Update Delivery Status</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STEPS.map((s) => {
            const isCurrent = order.status === s.id;
            const enabled = canEdit && allowed.has(s.id) && !move.isPending;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!enabled}
                onClick={() => move.mutate(s.id)}
                aria-pressed={isCurrent}
                title={!isCurrent && !allowed.has(s.id) ? "Not the next step from the current status" : undefined}
                className={cn(
                  "p-3 rounded-lg border-2 transition-all text-sm font-medium disabled:cursor-not-allowed",
                  isCurrent
                    ? s.active
                    : enabled
                      ? "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      : "border-gray-200 bg-white text-gray-400",
                )}
              >
                {isCurrent && <Check className="size-4 mx-auto mb-1" />}
                {s.label}
              </button>
            );
          })}
        </div>
        {order.status === "driver_assigned" && (
          <p className="text-xs text-gray-500 mt-3">Driver assigned — mark the parcel as picked up once collected.</p>
        )}
      </div>
      <HistoryToggle order={order} />
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Change Driver — ${order.reference}`}
        people={drivers.data}
        currentId={d.driver?.id}
        onSubmit={(id) => assign.mutate(id)}
        pending={assign.isPending}
      />
    </div>
  );
}

export function ExpressRowDetails({ order }: { order: ExpressOrder }) {
  if (order.stage === "waiting_quote") return <WaitingQuote order={order} />;
  if (order.stage === "quoted") return <Quoted order={order} />;
  if (order.stage === "in_progress") return <InProgress order={order} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">This order was cancelled.</p>
      <HistoryToggle order={order} />
    </div>
  );
}
