"use client";

import { useQuery } from "@tanstack/react-query";
import { Camera, ImagePlus, PenLine, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { deliveriesApi, deliveryKeys, type Delivery, type DeliveryExceptionFlag } from "@/lib/api/services/deliveries";
import { orderKeys } from "@/lib/api/services/orders";
import { returnKeys } from "@/lib/api/services/returns";

import { EXCEPTION } from "./badges";
import { FormAlert, IMAGE_ACCEPT, fromLocalInput, mergedErrors, toLocalInput, useObjectUrls } from "./form-helpers";

/** Every delivery change can move the order (and, when returned, open a return). */
const INVALIDATE = [deliveryKeys.all, orderKeys.all, returnKeys.all];
const MAX_PHOTOS = 6;

const footer = (label: string, onSubmit: () => void, onClose: () => void, pending: boolean, variant: "primary" | "success" | "danger" = "primary") => (
  <>
    <Button variant={variant} className="flex-1" onClick={onSubmit} loading={pending}>
      {label}
    </Button>
    <Button variant="muted" onClick={onClose} disabled={pending}>
      Cancel
    </Button>
  </>
);

/* ----------------------------------------------------------- assign driver */

export function AssignDriverDialog({ delivery, open, onClose }: { delivery: Delivery; open: boolean; onClose: () => void }) {
  const drivers = useQuery({ queryKey: deliveryKeys.drivers, queryFn: deliveriesApi.drivers, enabled: open, staleTime: 60_000 });
  const [driver, setDriver] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setDriver(delivery.driver ? String(delivery.driver.id) : "");
      setScheduled(toLocalInput(delivery.scheduled_at));
      setNote("");
      setError(null);
      setLocal({});
    }
  }, [open, delivery.driver, delivery.scheduled_at]);

  const change = Boolean(delivery.driver);
  const assign = useApiMutation(
    () => deliveriesApi.assignDriver(delivery.id, { driver: Number(driver), scheduled_at: fromLocalInput(scheduled), note }),
    {
      invalidate: INVALIDATE,
      success: (d) => `${d.reference}: driver ${d.driver?.full_name ?? ""} assigned`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const submit = () => {
    if (!driver) return setLocal({ driver: "Choose a driver." });
    setLocal({});
    assign.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${change ? "Change" : "Assign"} Driver — ${delivery.reference}`}
      size="lg"
      footer={footer(change ? "Change Driver" : "Assign Driver", submit, onClose, assign.isPending)}
    >
      <div className="space-y-4">
        <Field label="Driver" required htmlFor="dl-driver" error={fe.driver}>
          <Select id="dl-driver" value={driver} onChange={(e) => setDriver(e.target.value)} disabled={drivers.isPending}>
            <option value="">{drivers.isPending ? "Loading drivers…" : "Select a driver"}</option>
            {drivers.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </Select>
        </Field>
        {drivers.data?.length === 0 && <p className="text-sm text-gray-500">No active drivers. Add them under People.</p>}
        <Field label="Scheduled date & time" htmlFor="dl-sched" error={fe.scheduled_at} hint="Optional — keeps the current schedule when empty.">
          <Input id="dl-sched" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor="dl-note" error={fe.note}>
          <Textarea id="dl-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Instructions for the driver..." />
        </Field>
        <FormAlert error={error} shown={["driver", "scheduled_at", "note"]} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ transitions */

export type StatusMode = "out_for_delivery" | "failed" | "rescheduled" | "returned" | "cancelled";

export function StatusDialog({ delivery, mode, onClose }: { delivery: Delivery; mode: StatusMode | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [flag, setFlag] = useState<DeliveryExceptionFlag | "">("");
  const [scheduled, setScheduled] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (mode) {
      setNote("");
      setFlag(delivery.exception_flag);
      setScheduled("");
      setError(null);
      setLocal({});
    }
  }, [mode, delivery.exception_flag]);

  const move = useApiMutation(
    () =>
      deliveriesApi.transition(delivery.id, {
        status: mode!,
        note,
        ...(mode === "failed" ? { exception_flag: flag } : {}),
        ...(mode === "rescheduled" ? { scheduled_at: fromLocalInput(scheduled) } : {}),
      }),
    {
      invalidate: INVALIDATE,
      success: (d) =>
        d.status === "returned" ? `${d.reference} returned — a return was opened for ${d.order.reference}` : `${d.reference}: ${d.status_display}`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const submit = () => {
    if (mode === "failed" && !note.trim() && !flag) return setLocal({ note: "Give a reason or choose an exception flag." });
    if (mode === "rescheduled" && !scheduled) return setLocal({ scheduled_at: "Choose the new delivery date." });
    setLocal({});
    move.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const noteField = (label: string, placeholder: string, required = false) => (
    <Field label={label} required={required} htmlFor="ds-note" error={fe.note}>
      <Textarea id="ds-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
    </Field>
  );
  const alert = <FormAlert error={error} shown={["note", "scheduled_at", "exception_flag"]} />;

  if (mode === "failed") {
    return (
      <Modal open onClose={onClose} title={`Mark Failed — ${delivery.reference}`} size="lg" footer={footer("Mark Failed", submit, onClose, move.isPending, "danger")}>
        <div className="space-y-4">
          <Field label="Exception flag" htmlFor="ds-flag" error={fe.exception_flag}>
            <Select id="ds-flag" value={flag} onChange={(e) => setFlag(e.target.value as DeliveryExceptionFlag | "")}>
              <option value="">No flag</option>
              {Object.entries(EXCEPTION).map(([v, [, l]]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          {noteField("Reason", "What happened at the delivery point?", !flag)}
          <p className="text-xs text-gray-500">Attempt {delivery.attempts + 1} will be recorded. You can reschedule or return the delivery afterwards.</p>
          {alert}
        </div>
      </Modal>
    );
  }

  if (mode === "rescheduled") {
    return (
      <Modal open onClose={onClose} title={`Reschedule — ${delivery.reference}`} size="lg" footer={footer("Reschedule", submit, onClose, move.isPending)}>
        <div className="space-y-4">
          <Field label="New date & time" required htmlFor="ds-sched" error={fe.scheduled_at}>
            <Input id="ds-sched" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} invalid={Boolean(fe.scheduled_at)} />
          </Field>
          {noteField("Note (optional)", "Why is it being rescheduled?")}
          {alert}
        </div>
      </Modal>
    );
  }

  const confirm = {
    out_for_delivery: {
      title: `Out for Delivery — ${delivery.reference}`,
      message: <>Confirm that {delivery.driver?.full_name ?? "the driver"} has left with the parcel.</>,
      label: "Mark Out for Delivery",
      tone: "primary" as const,
    },
    returned: {
      title: `Mark Returned — ${delivery.reference}`,
      message: <>The parcel goes back to the warehouse and a return is opened for {delivery.order.reference}. This can&apos;t be undone.</>,
      label: "Mark Returned",
      tone: "danger" as const,
    },
    cancelled: {
      title: `Cancel Delivery — ${delivery.reference}`,
      message: <>The delivery is cancelled and can&apos;t be reopened. The order itself is not cancelled.</>,
      label: "Cancel Delivery",
      tone: "danger" as const,
    },
  };
  const c = mode ? confirm[mode] : null;
  return (
    <ConfirmDialog
      open={Boolean(c)}
      title={c?.title ?? ""}
      message={c?.message}
      confirmLabel={c?.label}
      tone={c?.tone}
      pending={move.isPending}
      onConfirm={submit}
      onClose={onClose}
    >
      <div className="mt-4 space-y-3">
        {noteField("Note (optional)", "Add context for the history...")}
        {alert}
      </div>
    </ConfirmDialog>
  );
}

/* ---------------------------------------------------------- photo inputs */

function PhotoPicker({ files, onChange, max, error }: { files: File[]; onChange: (f: File[]) => void; max: number; error?: string }) {
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
        aria-label="Add delivery photos"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          onChange([...files, ...picked].slice(0, max));
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative">
            {urls[i] && (
              // eslint-disable-next-line @next/next/no-img-element -- local preview (object URL)
              <img src={urls[i]} alt={`Photo ${i + 1}: ${f.name}`} className="w-full h-24 object-cover rounded-lg border border-gray-200" />
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
        {files.length < max && (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Camera className="size-5 mb-1" />
            <span className="text-xs font-medium">Add photo</span>
          </button>
        )}
      </div>
      <p className={error ? "text-xs text-red-600 mt-1" : "text-xs text-gray-500 mt-1"}>
        {error ?? `${files.length}/${max} photos · JPEG, PNG or WebP`}
      </p>
    </div>
  );
}

function SignaturePicker({ file, onChange, error }: { file: File | null; onChange: (f: File | null) => void; error?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const files = useMemo(() => (file ? [file] : []), [file]);
  const [url] = useObjectUrls(files);
  return (
    <div>
      <input
        ref={ref}
        id="dc-signature"
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {file && url ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview (object URL) */}
          <img src={url} alt="Signature preview" className="border border-gray-200 rounded max-w-xs max-h-32 bg-white" />
          <button type="button" onClick={() => onChange(null)} className="text-sm font-medium text-red-600 hover:text-red-800">
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <PenLine className="size-4" /> Upload signature image
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}


/* -------------------------------------------------------- complete delivery */

export function CompleteDeliveryDialog({ delivery, open, onClose }: { delivery: Delivery; open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setName(delivery.recipient_name || delivery.customer.full_name);
      setCompletedAt(toLocalInput(new Date().toISOString()));
      setNotes("");
      setSignature(null);
      setPhotos([]);
      setError(null);
      setLocal({});
    }
  }, [open, delivery.recipient_name, delivery.customer.full_name]);

  const complete = useApiMutation(
    () => {
      const form = new FormData();
      form.append("signature_name", name.trim());
      form.append("notes", notes);
      const at = fromLocalInput(completedAt);
      if (at) form.append("completed_at", at);
      if (signature) form.append("signature_image", signature);
      photos.forEach((p) => form.append("photos", p));
      return deliveriesApi.complete(delivery.id, form);
    },
    {
      invalidate: INVALIDATE,
      success: (d) => `${d.reference} delivered — proof of delivery saved`,
      onSuccess: onClose,
      onError: setError,
    },
  );
  const submit = () => {
    if (!name.trim()) return setLocal({ signature_name: "Enter the name of the person who received the delivery." });
    if (completedAt && new Date(completedAt).getTime() > Date.now() + 60_000) return setLocal({ completed_at: "The completion time can't be in the future." });
    setLocal({});
    complete.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Complete Delivery — ${delivery.reference}`}
      footer={footer("Confirm Delivered", submit, onClose, complete.isPending, "success")}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Record the proof of delivery for <strong>{delivery.customer.full_name}</strong> at {delivery.delivery_address}.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Received by (signature name)" required htmlFor="dc-name" error={fe.signature_name}>
            <Input id="dc-name" value={name} onChange={(e) => setName(e.target.value)} invalid={Boolean(fe.signature_name)} />
          </Field>
          <Field label="Completed at" htmlFor="dc-at" error={fe.completed_at}>
            <Input id="dc-at" type="datetime-local" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Signature image (optional)" htmlFor="dc-signature">
          <SignaturePicker file={signature} onChange={setSignature} error={fe.signature_image} />
        </Field>
        <Field label="Notes" htmlFor="dc-notes" error={fe.notes}>
          <Textarea id="dc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Delivered to customer at door. Customer verified ID." />
        </Field>
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">Delivery photos (up to {MAX_PHOTOS})</p>
          <PhotoPicker files={photos} onChange={setPhotos} max={MAX_PHOTOS} error={fe.photos} />
        </div>
        <FormAlert error={error} shown={["signature_name", "completed_at", "signature_image", "notes", "photos"]} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- add proof */

export function AddProofDialog({ delivery, open, onClose }: { delivery: Delivery; open: boolean; onClose: () => void }) {
  const hasSignature = Boolean(delivery.proof?.signature_name);
  const existing = delivery.proof?.photos.length ?? 0;
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setName(delivery.recipient_name || delivery.customer.full_name);
      setNotes("");
      setPhotos([]);
      setError(null);
      setLocal({});
    }
  }, [open, delivery.recipient_name, delivery.customer.full_name]);

  const add = useApiMutation(
    () => {
      const form = new FormData();
      if (!hasSignature) {
        form.append("signature_name", name.trim());
        form.append("notes", notes);
      }
      photos.forEach((p) => form.append("photos", p));
      return deliveriesApi.addProof(delivery.id, form);
    },
    { invalidate: [deliveryKeys.all], success: (d) => `Proof added to ${d.reference}`, onSuccess: onClose, onError: setError },
  );
  const submit = () => {
    if (!hasSignature && !name.trim()) return setLocal({ signature_name: "Enter the name of the person who received the delivery." });
    if (hasSignature && photos.length === 0) return setLocal({ photos: "Add at least one photo." });
    setLocal({});
    add.mutate(undefined);
  };
  const fe = mergedErrors(error, local);

  return (
    <Modal open={open} onClose={onClose} title={`Add Delivery Proof — ${delivery.reference}`} footer={footer("Save Proof", submit, onClose, add.isPending)}>
      <div className="space-y-4">
        {!hasSignature && (
          <>
            <Field label="Received by (signature name)" required htmlFor="dp-name" error={fe.signature_name}>
              <Input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} invalid={Boolean(fe.signature_name)} />
            </Field>
            <Field label="Notes" htmlFor="dp-notes" error={fe.notes}>
              <Textarea id="dp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </>
        )}
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <ImagePlus className="size-4" /> Delivery photos
            {existing > 0 && <span className="text-xs font-normal text-gray-500">({existing} already attached)</span>}
          </p>
          <PhotoPicker files={photos} onChange={setPhotos} max={MAX_PHOTOS} error={fe.photos} />
        </div>
        <FormAlert error={error} shown={["signature_name", "notes", "photos"]} />
      </div>
    </Modal>
  );
}
