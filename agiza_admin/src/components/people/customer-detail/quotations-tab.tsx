"use client";

import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { can, useMe } from "@/hooks/use-me";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { crmApi, type CustomerProfile } from "@/lib/api/services/crm";
import { errorText } from "@/lib/api/errors";
import { formatDate, formatTSh } from "@/lib/format";

import { Pill, statusColor, TabEmpty } from "./shared";

/** Design: "Quotation Requests — {name}" with Reply with Quote / Open in Chat on unanswered ones. */
export function QuotationsTab({ profile }: { profile: CustomerProfile }) {
  const { quotations, customer } = profile;
  const router = useRouter();
  const { data: me } = useMe();
  const canQuote = can(me, "intake_quotes", "view");
  const canChat = can(me, "chat", "view");

  const openChat = useApiMutation(() => crmApi.openConversation(customer), {
    onSuccess: (id) => router.push(`/chat?open=${id}`),
    onError: (e) => toast.error(`Couldn't open the chat: ${errorText(e)}`),
  });

  return (
    <div className="p-4 sm:p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Quotation Requests — {customer.full_name}</h3>
      {quotations.length === 0 ? (
        <TabEmpty icon={MessageSquare} text="No quotation requests" />
      ) : (
        <div className="space-y-3">
          {quotations.map((q) => (
            <div
              key={q.id}
              className={`border rounded-xl p-4 ${q.unanswered ? "border-red-200 bg-red-50" : "border-gray-200"}`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-mono text-xs text-gray-400">{q.reference}</span>
                  <span className="font-semibold text-gray-900">{q.service_type}</span>
                  <Pill
                    label={q.unanswered ? "Unanswered" : q.status_display}
                    className={q.unanswered ? "bg-red-100 text-red-700" : statusColor(q.status)}
                  />
                  {q.quoted_amount && (
                    <span className="text-xs font-semibold text-gray-700">{formatTSh(q.quoted_amount)}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(q.date)}</span>
              </div>
              <p className="text-sm text-gray-700 bg-white border border-gray-100 rounded-lg px-3 py-2 italic whitespace-pre-line">
                &ldquo;{q.message}&rdquo;
              </p>
              {q.unanswered && (canQuote || canChat) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canQuote && (
                    <Button
                      size="sm"
                      className="px-4 text-xs font-semibold"
                      onClick={() => router.push(`/intake-quotes?search=${encodeURIComponent(q.reference)}`)}
                    >
                      Reply with Quote
                    </Button>
                  )}
                  {canChat && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="px-4 text-xs font-semibold"
                      loading={openChat.isPending}
                      onClick={() => openChat.mutate(undefined)}
                    >
                      Open in Chat
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
