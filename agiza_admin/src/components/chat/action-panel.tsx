"use client";

import { AlertCircle, Check, CheckCircle, Edit3, FileText, Package, RotateCcw, Send, User, UserPlus, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import type { Conversation } from "@/lib/api/services/chat";
import { cn } from "@/lib/cn";

import { orderHref, quoteHref } from "./config";

interface Action {
  label: string;
  icon: LucideIcon;
  variant: "primary" | "secondary";
  onClick?: () => void;
  disabledReason?: string;
  pending?: boolean;
}

export interface PanelHandlers {
  onCreateQuote: () => void;
  onSendQuote: () => void;
  onResendQuote: () => void;
  onPaymentReminder: () => void;
  onArchive: () => void;
  onReopen: () => void;
  onReassign: () => void;
}

export function ActionPanel({
  conv,
  canEdit,
  pending,
  handlers,
}: {
  conv: Conversation;
  canEdit: boolean;
  pending: { resend: boolean; status: boolean };
  handlers: PanelHandlers;
}) {
  const router = useRouter();
  const go = (href: string) => () => router.push(href);
  const orderRef = conv.order?.reference;
  const noOrder = "No order is linked to this conversation yet";

  const actions: Action[] = (() => {
    if (conv.status === "archived") {
      return [{ label: "Reopen Conversation", icon: RotateCcw, variant: "secondary", onClick: handlers.onReopen, pending: pending.status }];
    }
    switch (conv.lifecycle) {
      case "new_inquiry":
        return [
          { label: "Create Quote", icon: FileText, variant: "primary", onClick: handlers.onCreateQuote },
          { label: "Send Quote", icon: Send, variant: "secondary", onClick: handlers.onSendQuote },
        ];
      case "quoted":
        return [
          {
            label: "Update Quote",
            icon: Edit3,
            variant: "primary",
            onClick: conv.quote ? go(quoteHref(conv.quote.reference, conv.quote.status)) : undefined,
            disabledReason: conv.quote ? undefined : "No quotation linked",
          },
          {
            label: "Resend Quote",
            icon: Send,
            variant: "secondary",
            onClick: conv.quote ? handlers.onResendQuote : undefined,
            disabledReason: conv.quote ? undefined : "No quotation linked",
            pending: pending.resend,
          },
        ];
      case "awaiting_payment":
        return [
          {
            label: "Mark as Paid",
            icon: CheckCircle,
            variant: "primary",
            onClick: orderRef ? go(`/finance/payments?search=${encodeURIComponent(orderRef)}`) : undefined,
            disabledReason: orderRef ? undefined : `${noOrder} — approve the quotation to create it`,
          },
          { label: "Send Payment Reminder", icon: AlertCircle, variant: "secondary", onClick: handlers.onPaymentReminder },
        ];
      case "paid":
        return [
          { label: "Move to Shipping", icon: Package, variant: "primary", onClick: conv.order ? go(orderHref(conv.order)) : undefined, disabledReason: conv.order ? undefined : noOrder },
          { label: "View Order Details", icon: FileText, variant: "secondary", onClick: conv.order ? go(orderHref(conv.order)) : undefined, disabledReason: conv.order ? undefined : noOrder },
        ];
      case "shipping":
        return [
          { label: "Mark as Delivered", icon: CheckCircle, variant: "primary", onClick: orderRef ? go(`/deliveries?search=${encodeURIComponent(orderRef)}`) : undefined, disabledReason: orderRef ? undefined : noOrder },
          { label: "Update Tracking", icon: Package, variant: "secondary", onClick: orderRef ? go(`/shipping?search=${encodeURIComponent(orderRef)}`) : undefined, disabledReason: orderRef ? undefined : noOrder },
        ];
      case "delivered":
        return [{ label: "Archive Conversation", icon: Check, variant: "secondary", onClick: handlers.onArchive, pending: pending.status }];
    }
  })();

  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit &&
            actions.map((a) => {
              const disabled = !a.onClick || a.pending;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  disabled={disabled}
                  title={a.disabledReason}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs transition-all inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1",
                    a.variant === "primary" ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200",
                  )}
                >
                  <a.icon className="size-3.5" />
                  {a.pending ? "Working…" : a.label}
                </button>
              );
            })}
          {!canEdit && <span className="text-xs text-slate-500">View only — you can read this conversation.</span>}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <User className="size-4" />
            <span>
              Assigned: <span className="text-slate-900">{conv.assigned_agent?.full_name ?? "Unassigned"}</span>
            </span>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handlers.onReassign}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs transition-all inline-flex items-center gap-1.5"
            >
              <UserPlus className="size-3.5" />
              Reassign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
