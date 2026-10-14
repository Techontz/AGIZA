"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { can, useMe } from "@/hooks/use-me";
import { errorText } from "@/lib/api/errors";
import { deliveryKeys } from "@/lib/api/services/deliveries";
import { orderKeys, ordersApi, type ReleaseState } from "@/lib/api/services/orders";
import { shippingKeys } from "@/lib/api/services/shipping";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTSh } from "@/lib/format";

/** Orders or Finance managers may let an order go out with a balance due. */
export function useCanRelease() {
  const { data: me } = useMe();
  return can(me, "orders", "manage") || can(me, "finance", "manage");
}

type Target = { orderType: string; orderId: number; reference: string };

function useReleaseMutation({ orderType, orderId, reference }: Target, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ approved, note }: { approved: boolean; note: string }) =>
      ordersApi.releaseApproval(orderType, orderId, approved, note),
    onSuccess: (_, { approved }) => {
      for (const key of [orderKeys.all, deliveryKeys.all, shippingKeys.all]) qc.invalidateQueries({ queryKey: key });
      toast.success(approved ? `${reference} may go out with the balance due` : "Release approval withdrawn");
      onDone();
    },
    onError: (err) => toast.error(errorText(err)),
  });
}

/** Ask for the reason, then approve releasing the order with its balance due. */
function ReleaseDialog({ target, due, open, onClose }: { target: Target; due: string | null; open: boolean; onClose: () => void }) {
  const [note, setNote] = useState("");
  const save = useReleaseMutation(target, () => {
    setNote("");
    onClose();
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Release ${target.reference} with balance due`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" onClick={() => save.mutate({ approved: true, note: note.trim() })} loading={save.isPending} disabled={!note.trim()}>
            Approve release
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          {target.reference} still has <strong>{formatTSh(due)}</strong> due. Approving lets Shipping and Deliveries send it
          out before it is paid. The balance stays on the order.
        </p>
        <Field label="Reason" required htmlFor="release-note" hint="e.g. Pays cash on delivery, trusted repeat customer">
          <Textarea id="release-note" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Compact "Approve release" link for tables (Shipping & Tracking), shown to admins only. */
export function ReleaseButton({ due, ...target }: Target & { due: string | null }) {
  const canRelease = useCanRelease();
  const [open, setOpen] = useState(false);
  if (!canRelease) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap">
        <ShieldCheck className="size-3.5" /> Approve release
      </button>
      <ReleaseDialog target={target} due={due} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * "Payment exception" box: how much is still due and whether the order may ship / go out for delivery.
 * An order with a balance due waits until the customer pays or an admin approves releasing it.
 */
export function ReleaseApproval({
  orderType,
  orderId,
  reference,
  due,
  release,
  closed,
  compact,
}: Target & {
  due: string | null;
  release: ReleaseState;
  closed?: boolean;
  compact?: boolean;
}) {
  const canRelease = useCanRelease();
  const [open, setOpen] = useState(false);
  const target = { orderType, orderId, reference };
  const withdraw = useReleaseMutation(target, () => undefined);
  const owes = due !== null && Number(due) > 0;
  if (!owes && !release.approved) return null;

  return (
    <>
      <div
        className={cn(
          "rounded-lg border flex flex-wrap items-start justify-between gap-3",
          compact ? "p-3" : "p-4",
          release.blocked ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50",
        )}
      >
        <div className="flex gap-2 min-w-0">
          {release.blocked ? (
            <AlertTriangle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="size-5 text-amber-700 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm min-w-0">
            <p className={cn("font-semibold", release.blocked ? "text-red-800" : "text-amber-900")}>
              {owes ? `Payment exception: ${formatTSh(due)} due` : "Released with a balance due"}
            </p>
            {release.blocked ? (
              <p className="text-red-700">Doesn&apos;t ship or go out for delivery until paid or an admin approves the release.</p>
            ) : release.approved ? (
              <p className="text-amber-800">
                Release approved by {release.approved_by?.full_name ?? "an admin"}
                {release.approved_at ? ` · ${formatDateTime(release.approved_at)}` : ""}
                {release.note ? ` — “${release.note}”` : ""}
              </p>
            ) : (
              <p className="text-amber-800">Collect the balance on handover.</p>
            )}
          </div>
        </div>
        {canRelease && !closed && (release.blocked || release.approved) && (
          <Button
            size="sm"
            variant={release.approved ? "muted" : "primary"}
            onClick={() => (release.approved ? withdraw.mutate({ approved: false, note: "" }) : setOpen(true))}
            loading={withdraw.isPending}
          >
            <ShieldCheck className="size-4" />
            {release.approved ? "Withdraw approval" : "Approve release"}
          </Button>
        )}
      </div>
      <ReleaseDialog target={target} due={due} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
