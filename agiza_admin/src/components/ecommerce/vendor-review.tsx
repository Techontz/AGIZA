"use client";

import { Ban, CheckCircle, MessageSquareWarning, PlayCircle, RotateCcw, Search, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { catalogApi, catalogKeys, type ApprovalStatus, type Vendor } from "@/lib/api/services/catalog";
import { marketplaceKeys } from "@/lib/api/services/marketplace";

import { APPROVAL_LABEL } from "./marketplace-ui";

interface ReviewAction {
  to: ApprovalStatus;
  label: string;
  icon: LucideIcon;
  variant: NonNullable<ButtonProps["variant"]>;
  className?: string;
  /** Required reason (sent to the vendor). */
  reason?: string;
  help: string;
}

const START: ReviewAction = { to: "under_review", label: "Start review", icon: Search, variant: "outline", help: "The vendor sees that AGIZA is reviewing the application." };
const APPROVE: ReviewAction = { to: "approved", label: "Approve", icon: CheckCircle, variant: "success", help: "The store goes live: it is verified, can list products and a store location is created in its city." };
const CHANGES: ReviewAction = {
  to: "changes_requested",
  label: "Request changes",
  icon: MessageSquareWarning,
  variant: "outline",
  className: "text-orange-700 border-orange-200 hover:bg-orange-50",
  reason: "What does the vendor need to change?",
  help: "The vendor can edit the application and resubmit it.",
};
const REJECT: ReviewAction = {
  to: "rejected",
  label: "Reject",
  icon: XCircle,
  variant: "outline",
  className: "text-red-700 border-red-200 hover:bg-red-50",
  reason: "Reason for rejecting the application",
  help: "The application is closed. You can reconsider it later.",
};
const RECONSIDER: ReviewAction = { to: "under_review", label: "Reconsider", icon: RotateCcw, variant: "outline", help: "Re-open the application and put it back under review." };
const SUSPEND: ReviewAction = {
  to: "suspended",
  label: "Suspend",
  icon: Ban,
  variant: "outline",
  className: "text-red-700 border-red-200 hover:bg-red-50",
  reason: "Reason for suspending the vendor",
  help: "The store and its products are hidden and its stock can't be sold until it is reactivated.",
};
const REACTIVATE: ReviewAction = { to: "approved", label: "Reactivate", icon: PlayCircle, variant: "success", help: "The store and its approved products are visible again." };

/** The valid next steps from each status (mirrors marketplace.services.TRANSITIONS). */
export const REVIEW_ACTIONS: Record<ApprovalStatus, ReviewAction[]> = {
  pending: [START, APPROVE, CHANGES, REJECT],
  under_review: [APPROVE, CHANGES, REJECT],
  changes_requested: [REJECT],
  rejected: [RECONSIDER],
  approved: [SUSPEND],
  suspended: [REACTIVATE],
};

/** Buttons for the vendor's valid review actions; each opens a confirmation with a note. */
export function VendorReviewActions({ vendor, size = "md" }: { vendor: Vendor; size?: "sm" | "md" }) {
  const [action, setAction] = useState<ReviewAction | null>(null);
  const actions = REVIEW_ACTIONS[vendor.approval_status] ?? [];
  if (!actions.length) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <Button key={a.label} size={size} variant={a.variant} className={a.className} onClick={() => setAction(a)}>
            <a.icon className="size-4" /> {a.label}
          </Button>
        ))}
      </div>
      {action && <ReviewDialog vendor={vendor} action={action} onClose={() => setAction(null)} />}
    </>
  );
}

function ReviewDialog({ vendor, action, onClose }: { vendor: Vendor; action: ReviewAction; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});

  const review = useApiMutation(() => catalogApi.vendors.review(vendor.id, { status: action.to, note: note.trim() }), {
    invalidate: [catalogKeys.all, marketplaceKeys.all],
    success: (v) => `${v.name}: ${APPROVAL_LABEL[v.approval_status] ?? v.approval_status_display}`,
    onSuccess: onClose,
    onError: setError,
  });

  const submit = () => {
    if (action.reason && !note.trim()) return setLocal({ note: "This reason is sent to the vendor — please fill it in." });
    setLocal({});
    review.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  const danger = action.to === "rejected" || action.to === "suspended";

  return (
    <Modal
      open
      onClose={() => !review.isPending && onClose()}
      title={`${action.label} — ${vendor.name}`}
      size="lg"
      footer={
        <>
          <Button variant={danger ? "danger" : action.to === "approved" ? "success" : "primary"} className="flex-1" loading={review.isPending} onClick={submit}>
            {action.label}
          </Button>
          <Button variant="muted" onClick={onClose} disabled={review.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-gray-700">
          {APPROVAL_LABEL[vendor.approval_status]} → <span className="font-semibold">{APPROVAL_LABEL[action.to]}</span>. {action.help}
        </p>
        {vendor.self_service && <p className="text-sm text-gray-500">The store owner is notified{action.reason ? " with the reason below" : ""}.</p>}
        <Field label={action.reason ?? "Note (optional)"} required={Boolean(action.reason)} htmlFor={`review-note-${vendor.id}`} error={fe.note}>
          <Textarea
            id={`review-note-${vendor.id}`}
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={action.reason ? "Be specific: the vendor reads this." : "Add context for the history..."}
          />
        </Field>
        <FormAlert error={error} shown={["note"]} />
      </div>
    </Modal>
  );
}
