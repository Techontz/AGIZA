"use client";

import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { fileSrc } from "@/lib/api/files";
import {
  shippingApi,
  type Shipment,
  type ShipmentAlert,
  type ShipmentStatus,
  type TrackingUpdateInput,
  type TransitionInput,
  type UpdateShipmentInput,
} from "@/lib/api/services/shipping";
import { formatDate } from "@/lib/format";

import { ALERT_OPTIONS, FormErrorBox, localToIso, useFormErrors, useShippingMutation } from "./shared";

function Footer({ formId, label, pending, disabled, onClose, variant = "primary" }: {
  formId: string;
  label: string;
  pending: boolean;
  disabled?: boolean;
  onClose: () => void;
  variant?: "primary" | "danger" | "success";
}) {
  return (
    <>
      <Button type="submit" form={formId} variant={variant} className="flex-1" loading={pending} disabled={disabled}>
        {label}
      </Button>
      <Button variant="muted" onClick={onClose}>
        Cancel
      </Button>
    </>
  );
}

/* ---------------------------------------------------------- update status */

export function StatusDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const options = shipment.allowed_transitions.filter((t) => t.value !== "cancelled");
  const [status, setStatus] = useState<ShipmentStatus | "">(options[0]?.value ?? "");
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [when, setWhen] = useState("");
  const { errors, onError, reset } = useFormErrors();
  const m = useShippingMutation((d: TransitionInput) => shippingApi.shipments.transition(shipment.id, d), {
    success: (s) => `${s.cargo_id} is now ${s.status_display}`,
    onSuccess: onClose,
    onError,
  });
  return (
    <Modal open onClose={onClose} title="Update Status" size="lg" footer={<Footer formId="status-form" label="Update Status" pending={m.isPending} disabled={!status} onClose={onClose} />}>
      <form
        id="status-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!status) return;
          reset();
          m.mutate({ status, note: note.trim(), location: location.trim(), occurred_at: localToIso(when) });
        }}
      >
        <FormErrorBox errors={errors} fields={["status", "note", "location", "occurred_at"]} />
        <p className="text-sm text-gray-600">
          {shipment.cargo_id} is currently <span className="font-medium text-gray-900">{shipment.status_display}</span>.
        </p>
        <Field label="New Status" required htmlFor="st-status" error={errors.status}>
          <Select id="st-status" value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Location" htmlFor="st-loc" error={errors.location}>
          <Input id="st-loc" maxLength={150} placeholder="e.g. Guangzhou Port" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="When" htmlFor="st-when" hint="Leave blank for now" error={errors.occurred_at}>
          <Input id="st-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="st-note" error={errors.note}>
          <Textarea id="st-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------- tracking update */

export function TrackingDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [when, setWhen] = useState("");
  const { errors, onError, reset } = useFormErrors();
  const m = useShippingMutation((d: TrackingUpdateInput) => shippingApi.shipments.addEvent(shipment.id, d), {
    success: "Tracking update added",
    onSuccess: onClose,
    onError,
  });
  return (
    <Modal open onClose={onClose} title="Add Tracking Update" size="lg" footer={<Footer formId="track-form" label="Add Update" pending={m.isPending} disabled={!description.trim()} onClose={onClose} />}>
      <form
        id="track-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          reset();
          m.mutate({ description: description.trim(), location: location.trim(), occurred_at: localToIso(when) });
        }}
      >
        <FormErrorBox errors={errors} fields={["description", "location", "occurred_at"]} />
        <Field label="Update" required htmlFor="tr-desc" error={errors.description}>
          <Textarea id="tr-desc" rows={3} maxLength={255} placeholder="e.g. Vessel departed Shanghai" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Location" htmlFor="tr-loc" error={errors.location}>
          <Input id="tr-loc" maxLength={150} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="When" htmlFor="tr-when" hint="Leave blank for now" error={errors.occurred_at}>
          <Input id="tr-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------------- alert */

export function AlertDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const [alert, setAlert] = useState<ShipmentAlert>(shipment.alert || "customs_hold");
  const [note, setNote] = useState("");
  const { errors, onError, reset } = useFormErrors();
  const m = useShippingMutation((d: UpdateShipmentInput) => shippingApi.shipments.update(shipment.id, d), {
    success: (s) => (s.alert ? `Alert set: ${s.alert_display}` : "Alert cleared"),
    onSuccess: onClose,
    onError,
  });
  return (
    <Modal open onClose={onClose} title="Set Alert" size="lg" footer={<Footer formId="alert-form" label="Set Alert" variant="danger" pending={m.isPending} onClose={onClose} />}>
      <form
        id="alert-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          reset();
          m.mutate({ alert, alert_note: note.trim() });
        }}
      >
        <FormErrorBox errors={errors} fields={["alert", "alert_note"]} />
        <Field label="Alert" required htmlFor="al-type" error={errors.alert}>
          <Select id="al-type" value={alert} onChange={(e) => setAlert(e.target.value as ShipmentAlert)}>
            {ALERT_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="al-note" error={errors.alert_note}>
          <Textarea id="al-note" rows={2} placeholder="What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ edit details */

export function EditShipmentDialog({ shipment, onClose }: { shipment: Shipment; onClose: () => void }) {
  const [eta, setEta] = useState(shipment.eta ?? "");
  const [mtn, setMtn] = useState(shipment.master_tracking_number);
  const [notes, setNotes] = useState(shipment.notes);
  const { errors, onError, reset } = useFormErrors();
  const m = useShippingMutation((d: UpdateShipmentInput) => shippingApi.shipments.update(shipment.id, d), {
    success: "Shipment updated",
    onSuccess: onClose,
    onError,
  });
  return (
    <Modal open onClose={onClose} title="Edit ETA & Tracking" size="lg" footer={<Footer formId="edit-form" label="Save Changes" pending={m.isPending} onClose={onClose} />}>
      <form
        id="edit-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          reset();
          m.mutate({ eta: eta || null, master_tracking_number: mtn.trim(), notes: notes.trim() });
        }}
      >
        <FormErrorBox errors={errors} fields={["eta", "master_tracking_number", "notes"]} />
        <Field label="ETA" htmlFor="ed-eta" error={errors.eta}>
          <Input id="ed-eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} invalid={Boolean(errors.eta)} />
        </Field>
        <Field label="Master Tracking #" htmlFor="ed-mtn" hint="Bill of lading / air waybill" error={errors.master_tracking_number}>
          <Input id="ed-mtn" maxLength={80} value={mtn} onChange={(e) => setMtn(e.target.value)} invalid={Boolean(errors.master_tracking_number)} />
        </Field>
        <Field label="Notes" htmlFor="ed-notes" error={errors.notes}>
          <Textarea id="ed-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------- documents */

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export function DocumentsGrid({ shipment }: { shipment: Shipment }) {
  if (!shipment.documents.length) return <p className="text-sm text-gray-500">No documents uploaded yet.</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {shipment.documents.map((doc) => (
        <a
          key={doc.id}
          href={fileSrc(doc.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
        >
          <FileText className="size-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate" title={doc.name}>{doc.name}</p>
            {doc.notes ? <p className="text-xs text-gray-500 truncate">{doc.notes}</p> : <p className="text-xs text-gray-400">{formatDate(doc.created_at)}</p>}
          </div>
        </a>
      ))}
    </div>
  );
}

export function UploadDocumentForm({ shipment, onDone }: { shipment: Shipment; onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { errors, onError, reset } = useFormErrors();
  const m = useShippingMutation((form: FormData) => shippingApi.shipments.uploadDocument(shipment.id, form), {
    success: "Document uploaded",
    onSuccess: () => {
      setFile(null);
      setName("");
      setNotes("");
      if (inputRef.current) inputRef.current.value = "";
      onDone?.();
    },
    onError,
  });
  const tooBig = file ? file.size > MAX_BYTES : false;

  return (
    <form
      className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-lg"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file || tooBig) return;
        reset();
        const form = new FormData();
        form.append("file", file);
        if (name.trim()) form.append("name", name.trim());
        if (notes.trim()) form.append("notes", notes.trim());
        m.mutate(form);
      }}
    >
      <FormErrorBox errors={errors} fields={["file", "name", "notes"]} />
      <Field label="File" required htmlFor={`doc-file-${shipment.id}`} hint="PDF, JPEG, PNG or WebP · max 8 MB" error={errors.file ?? (tooBig ? "Files must be 8 MB or smaller." : undefined)}>
        <input
          ref={inputRef}
          id={`doc-file-${shipment.id}`}
          type="file"
          accept={ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-700 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-100 file:text-blue-800 file:font-medium hover:file:bg-blue-200"
        />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" htmlFor={`doc-name-${shipment.id}`} error={errors.name}>
          <Input id={`doc-name-${shipment.id}`} maxLength={160} placeholder="e.g. Bill of Lading" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor={`doc-notes-${shipment.id}`} error={errors.notes}>
          <Input id={`doc-notes-${shipment.id}`} maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" size="sm" loading={m.isPending} disabled={!file || tooBig}>
        <Upload className="size-4" />
        Upload Document
      </Button>
    </form>
  );
}

export function DocumentsModal({ shipment, canEdit, onClose }: { shipment: Shipment; canEdit: boolean; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Documents · ${shipment.cargo_id}`} size="3xl">
      <div className="space-y-6">
        <DocumentsGrid shipment={shipment} />
        {canEdit && <UploadDocumentForm shipment={shipment} />}
      </div>
    </Modal>
  );
}
