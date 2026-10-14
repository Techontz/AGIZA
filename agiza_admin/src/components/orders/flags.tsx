"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Flag, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { can, useMe } from "@/hooks/use-me";
import { errorText } from "@/lib/api/errors";
import { deliveryKeys } from "@/lib/api/services/deliveries";
import { flagsApi, orderKeys, type OrderFlagKind, type OrderFlagRef } from "@/lib/api/services/orders";
import { procurementKeys } from "@/lib/api/services/procurement";
import { shippingKeys } from "@/lib/api/services/shipping";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

/** Kinds staff can raise (the automatic ones come from the server's hourly check). */
const MANUAL: [OrderFlagKind, string][] = [
  ["needs_care", "Needs Care"],
  ["very_late", "Very Late"],
  ["angry_client", "Angry Client"],
  ["needs_documentation", "Needs Documentation"],
  ["other", "Other Issue"],
];

const TONE: Record<OrderFlagKind, string> = {
  needs_care: "bg-amber-100 text-amber-800",
  very_late: "bg-red-100 text-red-800",
  angry_client: "bg-rose-100 text-rose-800",
  needs_documentation: "bg-indigo-100 text-indigo-800",
  other: "bg-gray-100 text-gray-800",
  procurement_stalled: "bg-orange-100 text-orange-800",
  delivery_due_soon: "bg-orange-100 text-orange-800",
};

/** Procurement, Shipping, Deliveries and Orders editors may raise and resolve flags. */
export function useCanFlag() {
  const { data: me } = useMe();
  return (["orders", "procurement", "shipping", "deliveries"] as const).some((m) => can(me, m, "edit"));
}

function useFlagMutation<V, R>(fn: (v: V) => Promise<R>, success: string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of [orderKeys.all, procurementKeys.all, shippingKeys.all, deliveryKeys.all]) qc.invalidateQueries({ queryKey: key });
      toast.success(success);
      onDone();
    },
    onError: (err) => toast.error(errorText(err)),
  });
}

/** Compact flag pills for table rows. */
export function FlagBadges({ flags, className }: { flags: OrderFlagRef[] | undefined; className?: string }) {
  if (!flags?.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {flags.map((f) => (
        <span
          key={f.id}
          title={f.note || f.kind_display}
          className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap", TONE[f.kind])}
        >
          {f.automatic ? <Zap className="size-3" /> : <Flag className="size-3" />}
          {f.kind_display}
        </span>
      ))}
    </div>
  );
}

/** "Flag issue" dialog: the kind and what's going on. */
export function RaiseFlagDialog({
  orderId,
  reference,
  department,
  open,
  onClose,
}: {
  orderId: number;
  reference: string;
  department?: "procurement" | "shipping" | "delivery" | "support";
  open: boolean;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<OrderFlagKind>("needs_care");
  const [note, setNote] = useState("");
  const raise = useFlagMutation(
    () => flagsApi.raise({ order: orderId, kind, note: note.trim(), department }),
    `${reference} flagged`,
    () => {
      setNote("");
      onClose();
    },
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Flag an issue on ${reference}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" variant="danger" onClick={() => raise.mutate(undefined)} loading={raise.isPending} disabled={kind === "other" && !note.trim()}>
            <Flag className="size-4" /> Raise flag
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Issue" required htmlFor="flag-kind">
          <Select id="flag-kind" value={kind} onChange={(e) => setKind(e.target.value as OrderFlagKind)}>
            {MANUAL.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What's going on" required={kind === "other"} htmlFor="flag-note" hint="Everyone handling the order sees this">
          <Textarea id="flag-note" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Small "Flag" link for table rows. */
export function FlagButton(props: { orderId: number; reference: string; department?: "procurement" | "shipping" | "delivery" | "support" }) {
  const canFlag = useCanFlag();
  const [open, setOpen] = useState(false);
  if (!canFlag) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap">
        <Flag className="size-3.5" /> Flag issue
      </button>
      <RaiseFlagDialog {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ResolveDialog({ flag, onClose }: { flag: OrderFlagRef; onClose: () => void }) {
  const [note, setNote] = useState("");
  const resolve = useFlagMutation(() => flagsApi.resolve(flag.id, note.trim()), `${flag.kind_display} resolved`, onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Resolve: ${flag.kind_display}`}
      size="lg"
      footer={
        <>
          <Button className="flex-1" variant="success" onClick={() => resolve.mutate(undefined)} loading={resolve.isPending} disabled={!note.trim()}>
            <CheckCircle2 className="size-4" /> Resolve
          </Button>
          <Button variant="muted" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <Field label="What was done" required htmlFor="flag-resolution">
        <Textarea id="flag-resolution" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

/** Order detail panel: open flags with who raised them, Resolve, and "Flag issue". */
export function OrderFlagsPanel({
  orderId,
  reference,
  flags,
  department,
  closed,
}: {
  orderId: number;
  reference: string;
  flags: OrderFlagRef[];
  department?: "procurement" | "shipping" | "delivery" | "support";
  closed?: boolean;
}) {
  const canFlag = useCanFlag();
  const [raising, setRaising] = useState(false);
  const [resolving, setResolving] = useState<OrderFlagRef | null>(null);
  if (!flags.length && (!canFlag || closed)) return null;
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Flag className="size-4 text-red-600" /> Exception Flags {flags.length > 0 && <span className="text-sm text-gray-500">({flags.length})</span>}
        </h3>
        {canFlag && !closed && (
          <Button size="sm" variant="outline" onClick={() => setRaising(true)}>
            <Flag className="size-4" /> Flag issue
          </Button>
        )}
      </div>
      {flags.length === 0 ? (
        <p className="text-sm text-gray-500">No open issues.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {flags.map((f) => (
            <li key={f.id} className="py-2 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <FlagBadges flags={[f]} />
                {f.note && <p className="text-sm text-gray-800 mt-1">{f.note}</p>}
                <p className="text-xs text-gray-500 mt-0.5">
                  {f.automatic ? "Raised automatically" : `Raised by ${f.raised_by?.full_name ?? "staff"}`}
                  {f.department ? ` · ${f.department}` : ""} · {timeAgo(f.created_at)}
                </p>
              </div>
              {canFlag && (
                <Button size="sm" variant="ghost" onClick={() => setResolving(f)}>
                  <CheckCircle2 className="size-4" /> Resolve
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <RaiseFlagDialog orderId={orderId} reference={reference} department={department} open={raising} onClose={() => setRaising(false)} />
      {resolving && <ResolveDialog flag={resolving} onClose={() => setResolving(null)} />}
    </div>
  );
}
