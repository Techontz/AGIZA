"use client";

import { Ban, CheckCircle, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { catalogKeys } from "@/lib/api/services/catalog";
import { productsApi, type ModerationAction, type ProductRow } from "@/lib/api/services/products";
import { cn } from "@/lib/cn";

interface Option {
  action: ModerationAction;
  label: string;
  icon: LucideIcon;
  btn: string;
  reason?: string;
  help: string;
}

const OPTIONS: Record<ModerationAction, Option> = {
  approve: { action: "approve", label: "Approve", icon: CheckCircle, btn: "bg-green-50 text-green-700 hover:bg-green-100", help: "The product is published in the vendor's store (if it is active and in stock)." },
  reject: { action: "reject", label: "Reject", icon: XCircle, btn: "bg-red-50 text-red-600 hover:bg-red-100", reason: "Reason for rejecting", help: "The vendor is told why and can fix the listing and resubmit it." },
  disable: { action: "disable", label: "Disable", icon: Ban, btn: "bg-gray-100 text-gray-600 hover:bg-gray-200", reason: "Reason for disabling", help: "The product is taken off the store. Use this for listings that break the marketplace rules." },
};

/** Which moderation actions apply: only self-service vendors' products go through review. */
export function moderationActions(p: Pick<ProductRow, "seller" | "review_status">): ModerationAction[] {
  if (!p.seller?.self_service) return [];
  switch (p.review_status) {
    case "pending":
      return ["approve", "reject", "disable"];
    case "approved":
      return ["reject", "disable"];
    case "rejected":
    case "disabled":
      return ["approve"];
    default:
      return ["approve", "reject", "disable"];
  }
}

/** Compact Approve / Reject / Disable buttons for a table row. */
export function ProductModerationButtons({ product, compact = true }: { product: ProductRow; compact?: boolean }) {
  const [action, setAction] = useState<ModerationAction | null>(null);
  const actions = moderationActions(product);
  if (!actions.length) return null;
  return (
    <>
      {actions.map((a) => {
        const o = OPTIONS[a];
        return compact ? (
          <button
            key={a}
            type="button"
            onClick={() => setAction(a)}
            className={cn("p-1.5 rounded-lg transition-colors", o.btn)}
            aria-label={`${o.label} ${product.name}`}
            title={o.label}
          >
            <o.icon className="size-3.5" />
          </button>
        ) : (
          <button key={a} type="button" onClick={() => setAction(a)} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", o.btn)}>
            <o.icon className="size-3.5" /> {o.label}
          </button>
        );
      })}
      {action && <ModerationDialog product={product} option={OPTIONS[action]} onClose={() => setAction(null)} />}
    </>
  );
}

function ModerationDialog({ product, option, onClose }: { product: ProductRow; option: Option; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const moderate = useApiMutation(() => productsApi.moderate(product.id, { action: option.action, note: note.trim() }), {
    invalidate: [catalogKeys.all],
    success: (p) => `${p.name}: ${p.review_status_display}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (option.reason && !note.trim()) return setLocal({ note: "Tell the vendor why." });
    setLocal({});
    moderate.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  return (
    <Modal
      open
      onClose={() => !moderate.isPending && onClose()}
      title={`${option.label} product`}
      size="lg"
      footer={
        <>
          <Button variant={option.action === "approve" ? "success" : "danger"} className="flex-1" loading={moderate.isPending} onClick={submit}>
            {option.label}
          </Button>
          <Button variant="muted" onClick={onClose} disabled={moderate.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="font-semibold text-gray-900">{product.name}</p>
          <p className="text-sm text-gray-600">
            {product.seller.name} · {product.sku} · {product.review_status_display}
          </p>
          {product.review_note && <p className="text-sm text-gray-600 mt-2">Last note: {product.review_note}</p>}
        </div>
        <p className="text-gray-700">{option.help}</p>
        <Field label={option.reason ?? "Note to the vendor (optional)"} required={Boolean(option.reason)} htmlFor={`mod-note-${product.id}`} error={fe.note}>
          <Textarea id={`mod-note-${product.id}`} rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The vendor sees this in the seller app." />
        </Field>
        <FormAlert error={error} shown={["note"]} />
      </div>
    </Modal>
  );
}
