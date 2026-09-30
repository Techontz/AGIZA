"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, PlayCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { can, useMe } from "@/hooks/use-me";
import { orderKeys } from "@/lib/api/services/orders";
import { marketplaceApi, marketplaceKeys, type Fulfillment, type IssueResolution } from "@/lib/api/services/marketplace";
import { returnKeys } from "@/lib/api/services/returns";
import { inventoryKeys } from "@/lib/api/services/warehouse";
import { cn } from "@/lib/cn";
import { formatDateTime, formatTSh, timeAgo } from "@/lib/format";

/** Cancelling a seller's part releases stock, changes the order total and may open a refund. */
const INVALIDATE = [marketplaceKeys.all, orderKeys.all, inventoryKeys.all, returnKeys.all, ["deliveries"], ["finance"], ["catalog"]];

/** Resolving a problem is an E-commerce edit action (Django enforces it). */
export function useCanResolveIssues() {
  const { data: me } = useMe();
  return can(me, "ecommerce", "edit");
}

/* ------------------------------------------------------------------ pickup */

const PICKUP_TONE: Record<string, BadgeTone> = {
  pending: "yellow",
  ready: "indigo",
  assigned: "blue",
  collected: "purple",
  at_hub: "green",
  failed: "red",
  cancelled: "gray",
};

/** Collection status of a seller's part (compact, for tables). */
export function PickupTag({ pickup }: { pickup: Fulfillment["pickup"] }) {
  if (!pickup) return <span className="text-xs text-gray-400">—</span>;
  return (
    <Link href={`/deliveries?view=pickups&psearch=${encodeURIComponent(pickup.reference)}`} className="inline-flex flex-col gap-0.5 group" title="Open in Pickups">
      <Badge tone={PICKUP_TONE[pickup.status] ?? "gray"} className="px-2 py-0.5">
        {pickup.status_display}
      </Badge>
      <span className="text-xs text-gray-500 font-mono group-hover:text-blue-600">{pickup.reference}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------- issue */

/** A seller's reported problem: open (amber, with Resolve) or resolved. */
export function IssueCell({ fulfillment: f, onResolve }: { fulfillment: Fulfillment; onResolve?: () => void }) {
  const issue = f.issue;
  if (!issue) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="max-w-64 whitespace-normal">
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5",
          issue.open ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700",
        )}
      >
        {issue.open ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
        {issue.type_display}
      </span>
      {issue.note && (
        <p className="text-xs text-gray-700 mt-1 line-clamp-2" title={issue.note}>
          {issue.note}
        </p>
      )}
      <p className="text-xs text-gray-500 mt-0.5" title={formatDateTime(issue.reported_at)}>
        Reported {timeAgo(issue.reported_at)}
        {issue.resolved_at && <> · resolved {formatDateTime(issue.resolved_at)}</>}
      </p>
      {issue.resolution && (
        <p className="text-xs text-gray-500 italic line-clamp-2" title={issue.resolution}>
          {issue.resolution}
        </p>
      )}
      {issue.open && onResolve && (
        <Button size="sm" variant="outline" className="mt-1.5 text-amber-800 border-amber-300 hover:bg-amber-50" onClick={onResolve}>
          Resolve
        </Button>
      )}
    </div>
  );
}

/**
 * AGIZA's decision on a seller's problem: carry on with the seller's part, or
 * cancel only that part (stock released, order total reduced, refund opened if
 * the customer already paid more than the new total).
 */
export function ResolveIssueModal({ fulfillment: f, onClose }: { fulfillment: Fulfillment; onClose: () => void }) {
  const [action, setAction] = useState<IssueResolution>("continue");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const resolve = useApiMutation(() => marketplaceApi.resolveIssue(f.id, { action, note: note.trim() }), {
    invalidate: INVALIDATE,
    success: () => (action === "continue" ? `${f.order_reference}: ${f.vendor.name} continues` : `${f.order_reference}: ${f.vendor.name}'s part cancelled`),
    onSuccess: onClose,
    onError: (e) => {
      setConfirm(false);
      setError(e);
    },
  });
  const submit = () => {
    if (!note.trim()) return setLocal({ note: "Say what was decided." });
    setLocal({});
    setError(null);
    if (action === "cancel_part") return setConfirm(true);
    resolve.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const issue = f.issue;
  const options: { value: IssueResolution; label: string; hint: string; icon: typeof PlayCircle }[] = [
    { value: "continue", label: "Continue", hint: "The seller carries on with this part of the order.", icon: PlayCircle },
    { value: "cancel_part", label: "Cancel this seller's part", hint: "Only this seller's items are cancelled; the rest of the order goes ahead.", icon: XCircle },
  ];

  return (
    <>
      <Modal
        open={!confirm}
        onClose={() => !resolve.isPending && onClose()}
        title={`Resolve Problem — ${f.order_reference}`}
        size="xl"
        footer={
          <>
            <Button className="flex-1" variant={action === "cancel_part" ? "danger" : "primary"} onClick={submit} loading={resolve.isPending}>
              {action === "cancel_part" ? "Cancel Seller's Part" : "Continue"}
            </Button>
            <Button variant="muted" onClick={onClose} disabled={resolve.isPending}>
              Close
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {issue && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> {f.vendor.name}: {issue.type_display}
              </p>
              {issue.note && <p className="text-amber-900 mt-1 whitespace-pre-line">{issue.note}</p>}
              <p className="text-xs text-amber-800 mt-1">Reported {formatDateTime(issue.reported_at)}</p>
            </div>
          )}
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Decision</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                    action === o.value
                      ? o.value === "cancel_part"
                        ? "border-red-600 bg-red-50"
                        : "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                >
                  <input type="radio" name="issue-action" value={o.value} checked={action === o.value} onChange={() => setAction(o.value)} className="sr-only" />
                  <o.icon className={cn("size-5 mt-0.5 flex-shrink-0", o.value === "cancel_part" ? "text-red-600" : "text-blue-600")} />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{o.label}</span>
                    <span className="block text-xs text-gray-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Note" required htmlFor="ri-note" error={fe.note} hint="Sent to the seller and kept in the order history.">
            <Textarea id="ri-note" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was decided and why..." />
          </Field>
          <FormAlert error={error} shown={["note"]} />
        </div>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title={`Cancel ${f.vendor.name}'s part?`}
        tone="danger"
        confirmLabel="Cancel Seller's Part"
        pending={resolve.isPending}
        onConfirm={() => resolve.mutate(undefined)}
        onClose={() => setConfirm(false)}
        message={
          <div className="space-y-2 text-sm">
            <p>
              Only {f.vendor.name}&apos;s {f.item_count} item(s) on {f.order_reference} are cancelled ({formatTSh(f.subtotal)}):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              <li>their reserved stock is released and the seller&apos;s earnings for this part are voided;</li>
              <li>the order total goes down by these items and their share of the delivery fee;</li>
              <li>if the customer already paid more than the new total, a refund is opened in Returns;</li>
              <li>the collection from this seller is cancelled. The rest of the order goes ahead.</li>
            </ul>
            <p className="text-gray-600">This can&apos;t be undone.</p>
          </div>
        }
      />
    </>
  );
}

/* ----------------------------------------------------------- open problems */

/**
 * Notice listing sellers' open fulfilment problems, linking to each order.
 * Renders nothing when there are none (or the user can't see them).
 */
export function OpenProblemsNotice({ className }: { className?: string }) {
  const query = { issue_open: true, page_size: 20 };
  const open = useQuery({
    queryKey: marketplaceKeys.fulfillments(query),
    queryFn: ({ signal }) => marketplaceApi.fulfillments(query, signal),
    staleTime: 30_000,
  });
  const rows = open.data?.results ?? [];
  if (!rows.length) return null;
  const count = open.data?.count ?? rows.length;
  return (
    <div role="status" className={cn("bg-amber-50 border border-amber-200 rounded-lg px-4 py-3", className)}>
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
        <AlertTriangle className="size-4 flex-shrink-0" />
        {count} open fulfilment problem{count === 1 ? "" : "s"} reported by sellers — decide to continue or cancel the seller&apos;s part
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/orders/ecommerce?search=${encodeURIComponent(r.order_reference)}&open=${r.order_id}`}
              className="inline-flex items-center gap-1 text-xs font-medium bg-white border border-amber-200 text-amber-900 rounded-full px-2.5 py-1 hover:bg-amber-100"
              title={r.issue?.note}
            >
              {r.order_reference} · {r.vendor.name} · {r.issue?.type_display}
              <ChevronRight className="size-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
