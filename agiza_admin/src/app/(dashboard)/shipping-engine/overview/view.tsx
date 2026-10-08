"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Clock,
  Edit,
  FlaskConical,
  Info,
  Layers,
  MapPin,
  Plus,
  Truck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useEngineAccess } from "@/components/shipping-engine/hooks";
import { MissingDeliveryPrices } from "@/components/shipping-engine/missing-delivery-prices";
import {
  Btn,
  EnginePage,
  IconButton,
  PageHeader,
  RouteChips,
  SectionCard,
  StatCard,
  StatusBadge,
  Tabs,
  td,
  th,
} from "@/components/shipping-engine/ui";
import { ErrorState } from "@/components/ui/states";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { engine, seKeys, type Scope } from "@/lib/api/services/shipping-engine";
import { timeAgo } from "@/lib/format";
import { pageMeta } from "@/lib/nav";

const TABS: { id: Scope; label: string }[] = [
  { id: "local", label: "Local Delivery (Tanzania)" },
  { id: "international", label: "International Shipping" },
];

export function OverviewView() {
  const meta = pageMeta["/shipping-engine/overview"];
  const router = useRouter();
  const { canEdit } = useEngineAccess();
  const [filters, setFilters] = useUrlFilters({ tab: "local" });
  const tab = filters.tab as Scope;
  const q = useQuery({ queryKey: seKeys.overview(tab), queryFn: () => engine.overview(tab) });
  const s = q.data?.stats;

  return (
    <EnginePage>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <>
            <Btn variant="secondary" icon={FlaskConical} onClick={() => router.push("/shipping-engine/test-rate")}>
              Test Rate
            </Btn>
            {canEdit && (
              <>
                <Btn variant="secondary" icon={MapPin} onClick={() => router.push("/shipping-engine/routes?new=1")}>
                  + Add Route
                </Btn>
                <Btn variant="secondary" icon={Layers} onClick={() => router.push("/shipping-engine/zones?new=1")}>
                  + Create Zone
                </Btn>
                <Btn variant="primary" icon={Plus} onClick={() => router.push(`/shipping-engine/rules?tab=${tab}&new=1`)}>
                  Create Shipping Rule
                </Btn>
              </>
            )}
          </>
        }
      />

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <>
          <MissingDeliveryPrices />
          <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-7 gap-4 mb-6">
            <StatCard label="Active Routes" value={s?.active_routes} icon={ArrowRight} color="blue" loading={!s} />
            <StatCard label="Shipping Zones" value={s?.zones} icon={MapPin} color="purple" loading={!s} />
            <StatCard label="Active Rules" value={s?.active_rules} icon={Zap} color="green" loading={!s} />
            <StatCard label="Profiles" value={s?.profiles} icon={Layers} color="indigo" loading={!s} />
            <StatCard label="Carriers" value={s?.carriers} icon={Truck} color="orange" loading={!s} />
            <StatCard label="Manual Quotes" value={s?.manual_quote_rules} icon={Clock} color="yellow" loading={!s} />
            <StatCard label="Overrides" value={s?.active_overrides} icon={AlertTriangle} color="red" loading={!s} />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Info className="size-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">Rule Priority Order</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs text-blue-700">
              {["1. Specific Product Rule", "2. Shipping Profile Rule", "3. General Route Rule"].map((item, i, arr) => (
                <span key={item} className="flex items-center gap-1">
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full">{item}</span>
                  {i < arr.length - 1 && <ChevronRight className="size-3 text-blue-400" />}
                </span>
              ))}
            </div>
          </div>

          <Tabs tabs={TABS} active={tab} onChange={(id) => setFilters({ tab: id })} />

          <SectionCard title="Recent Shipping Rules">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Rule", "Route", "Method", "Profile", "Pricing", "Rate", "Status", "Updated", "Actions"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {q.isPending ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 9 }).map((__, j) => (
                          <td key={j} className={td}>
                            <div className="h-4 rounded bg-gray-100 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : q.data!.recent_rules.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                        No {tab === "local" ? "local delivery" : "international shipping"} rules yet.{" "}
                        {canEdit && (
                          <Link href={`/shipping-engine/rules?tab=${tab}&new=1`} className="text-blue-600 hover:underline">
                            Create one
                          </Link>
                        )}
                      </td>
                    </tr>
                  ) : (
                    q.data!.recent_rules.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className={`${td} font-medium text-gray-900`}>{r.name}</td>
                        <td className={`${td} text-gray-600`}>
                          <RouteChips origin={r.origin_label} destination={r.destination_label} />
                        </td>
                        <td className={`${td} text-gray-600`}>{r.method}</td>
                        <td className={`${td} text-gray-600`}>{r.profile}</td>
                        <td className={`${td} text-gray-600`}>{r.pricing_model_display}</td>
                        <td className={`${td} font-medium text-gray-900 whitespace-nowrap`}>{r.rate_display}</td>
                        <td className={td}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className={`${td} text-gray-400 text-xs whitespace-nowrap`}>{timeAgo(r.updated_at)}</td>
                        <td className={td}>
                          <IconButton
                            icon={Edit}
                            label={`Open ${r.code}`}
                            size="sm"
                            onClick={() => router.push(`/shipping-engine/rules?tab=${tab}&edit=${r.id}`)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </EnginePage>
  );
}
