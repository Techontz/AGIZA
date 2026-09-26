"use client";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { ErrorState, Skeleton } from "@/components/ui/states";
import { UnderlineTabs } from "@/components/ui/tabs";
import { can, useMe } from "@/hooks/use-me";
import { errorText } from "@/lib/api/errors";
import { crmApi, crmKeys } from "@/lib/api/services/crm";

import { ActivityTab } from "./activity-tab";
import { OrdersTab, ReturnsTab } from "./history-tabs";
import { InterestsTab } from "./interests-tab";
import { OverviewTab, type DetailTab } from "./overview-tab";
import { QuotationsTab } from "./quotations-tab";
import { CLIENT_VALUE } from "./shared";
import { useDialogChrome } from "./use-dialog-chrome";

function LoadingBody() {
  return (
    <div className="p-4 sm:p-6 space-y-5" aria-busy="true" aria-label="Loading customer">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** People → customer detail (design: UserDetailModal), built from `customers/<id>/profile/`. */
export function CustomerDetailModal({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const { data: me } = useMe();
  const canEdit = can(me, "people", "edit");
  const query = useQuery({ queryKey: crmKeys.profile(customerId), queryFn: () => crmApi.profile(customerId) });
  useDialogChrome(panelRef, onClose);

  const profile = query.data;
  const unanswered = profile?.kpis.unanswered_quotes ?? 0;
  const value = profile ? CLIENT_VALUE[profile.client_value] : null;

  const tabs = [
    { value: "overview" as const, label: "Overview" },
    { value: "orders" as const, label: `Orders (${profile?.orders.length ?? 0})` },
    { value: "returns" as const, label: `Returns (${profile?.returns.length ?? 0})` },
    { value: "quotations" as const, label: `Quotations${unanswered > 0 ? ` · ${unanswered} unanswered` : ""}` },
    { value: "interests" as const, label: "Interests & Tags" },
    { value: "activity" as const, label: "Activity" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[96vh] sm:max-h-[92vh] overflow-hidden flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="size-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0">
              {profile ? profile.customer.full_name.charAt(0).toUpperCase() : ""}
            </div>
            <div className="min-w-0">
              {profile ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id={titleId} className="text-lg sm:text-xl font-bold text-gray-900 break-words">
                      {profile.customer.full_name}
                    </h2>
                    {value && (
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${value.color}`}>
                        {value.label}
                      </span>
                    )}
                    {unanswered > 0 && (
                      <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">
                        {unanswered} unanswered
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 break-words">
                    {[profile.customer.email, profile.customer.phone].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                </>
              ) : (
                <>
                  <h2 id={titleId} className="sr-only">
                    Customer details
                  </h2>
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-64 max-w-full" />
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="size-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        {profile && <UnderlineTabs options={tabs} value={tab} onChange={setTab} className="px-2 sm:px-6 gap-0 shrink-0 text-sm" />}

        {/* Content */}
        <div className="flex-1 overflow-y-auto" role={profile ? "tabpanel" : undefined} aria-label={profile ? tabs.find((t) => t.value === tab)?.label : undefined}>
          {query.isPending ? (
            <LoadingBody />
          ) : query.isError ? (
            <ErrorState bare message={errorText(query.error)} onRetry={() => query.refetch()} />
          ) : tab === "overview" ? (
            <OverviewTab profile={query.data} onTab={setTab} />
          ) : tab === "orders" ? (
            <OrdersTab profile={query.data} />
          ) : tab === "returns" ? (
            <ReturnsTab profile={query.data} />
          ) : tab === "quotations" ? (
            <QuotationsTab profile={query.data} />
          ) : tab === "interests" ? (
            <InterestsTab profile={query.data} canEdit={canEdit} />
          ) : (
            <ActivityTab profile={query.data} />
          )}
        </div>
      </div>
    </div>
  );
}
