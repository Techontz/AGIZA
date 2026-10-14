"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { shippingApi } from "@/lib/api/services/shipping";

import { FormErrorBox, useFormErrors, useShippingMutation } from "./shared";

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Bulk: set when customers can expect the orders of the selected shipments or parcels. Each customer is notified. */
export function ExpectedDeliveryModal({
  shipments = [],
  parcels = [],
  count,
  onClose,
  onDone,
}: {
  shipments?: number[];
  parcels?: number[];
  /** What is selected, for the title ("3 shipments", "5 orders"). */
  count: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const { errors, onError, reset } = useFormErrors();
  const save = useShippingMutation(
    () => shippingApi.shipments.expectedDelivery({ shipments, parcels, estimated_delivery: date, note: note.trim() }),
    {
      success: (r) =>
        r.changed
          ? `Expected delivery updated on ${r.changed} order(s); customers notified${r.skipped ? ` (${r.skipped} closed skipped)` : ""}`
          : "Those orders already had this date",
      onSuccess: onDone,
      onError,
    },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><CalendarClock className="size-6 text-blue-600" />Update Expected Delivery</span>}
      size="lg"
      footer={
        <>
          <Button
            className="flex-1"
            onClick={() => {
              reset();
              save.mutate(undefined);
            }}
            loading={save.isPending}
            disabled={!date}
          >
            Update &amp; notify customers
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <FormErrorBox errors={errors} fields={["estimated_delivery", "note"]} />
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Every open order in the {count} selected gets this date. Customers see it at the top of their order and get a
          notification.
        </p>
        <Field label="Expected delivery date" required htmlFor="ed-date" error={errors.estimated_delivery}>
          <Input id="ed-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} invalid={Boolean(errors.estimated_delivery)} />
        </Field>
        <Field label="Message to customers (optional)" htmlFor="ed-note" hint="e.g. The vessel was delayed at port" error={errors.note}>
          <Textarea id="ed-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
