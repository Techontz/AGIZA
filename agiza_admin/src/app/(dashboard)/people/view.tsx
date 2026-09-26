"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Ship, Store, Truck, UserPlus, Users, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { VendorModal } from "@/components/ecommerce/vendor-modals";
import { CampaignTargetingModal } from "@/components/people/campaign/campaign-targeting-modal";
import { CustomerDetailModal } from "@/components/people/customer-detail/customer-detail-modal";
import { CustomerFormModal } from "@/components/people/customer-form-modal";
import { PeopleTable } from "@/components/people/people-table";
import { fetchPeople, type PersonRow, type PersonSource } from "@/components/people/rows";
import { ServiceProviderModal } from "@/components/people/service-provider-modal";
import { usePeopleAccess } from "@/components/people/shared";
import { ShipperEditModal } from "@/components/people/shipper-edit-modal";
import { StaffFormModal } from "@/components/people/staff-form-modal";
import { Card } from "@/components/ui/card";
import { SearchInput, Select } from "@/components/ui/form";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { errorText } from "@/lib/api/errors";
import { peopleApi, peopleKeys, type PersonRole } from "@/lib/api/services/people";
import { pageMeta } from "@/lib/nav";

const ROLES: PersonRole[] = ["customer", "staff", "shipper", "shop_vendor", "service_provider", "driver"];
const ICONS: Record<PersonRole, LucideIcon> = {
  customer: Users,
  staff: Users,
  shipper: Ship,
  shop_vendor: Store,
  service_provider: Wrench,
  driver: Truck,
};
/** Lower-case labels with spaces, as in the prototype ("shop vendor"). */
const roleLabel = (r: PersonRole) => r.replace(/_/g, " ");
const select = "w-auto bg-white";
const PAGE_SIZE = 20;

/** Which modal is open: `source: null` adds a new person on that tab. */
type Editing = { role: PersonRole; source: PersonSource | null } | null;

export function PeopleView() {
  const meta = pageMeta["/people"];
  const qc = useQueryClient();
  const access = usePeopleAccess();
  const [f, setF] = useUrlFilters({ tab: "customer", search: "", status: "all", tag: "all", page: "1", open: "" });
  const tab: PersonRole = ROLES.includes(f.tab as PersonRole) ? (f.tab as PersonRole) : "customer";
  const [search, setSearch] = useState(f.search);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.search) setF({ search: debounced });
  }, [debounced, f.search, setF]);

  const [editing, setEditing] = useState<Editing>(null);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const stats = useQuery({ queryKey: peopleKeys.stats, queryFn: peopleApi.stats });
  const tags = useQuery({ queryKey: peopleKeys.tags, queryFn: peopleApi.tags, enabled: tab === "customer" });
  const query = { search: f.search, status: f.status, tag: tab === "customer" ? f.tag : "all", page: Number(f.page) || 1, page_size: PAGE_SIZE };
  const list = useQuery({
    queryKey: peopleKeys.list(tab, query),
    queryFn: ({ signal }) => fetchPeople(tab, query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const s = stats.data;

  const canEdit: Record<PersonRole, boolean> = {
    customer: access.customers,
    staff: access.staff,
    driver: access.staff,
    shipper: access.shippers,
    shop_vendor: access.vendors,
    service_provider: access.providers,
  };
  const openId = f.open ? Number(f.open) : null;

  const openRow = (row: PersonRow) => {
    if (row.source.kind === "customer") setF({ open: String(row.id) });
    else if (canEdit[tab]) setEditing({ role: tab, source: row.source });
  };
  const refreshPeople = () => qc.invalidateQueries({ queryKey: peopleKeys.all });

  const tagOptions = tags.data ?? [];
  const hasFilters = Boolean(f.search || f.status !== "all" || (tab === "customer" && f.tag !== "all"));

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <>
            {tab === "customer" && access.campaigns && (
              <button
                type="button"
                onClick={() => setCampaignOpen(true)}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center gap-2"
              >
                <Send className="size-5" />
                Send Campaign
              </button>
            )}
            {canEdit[tab] && (
              <button
                type="button"
                onClick={() => setEditing({ role: tab, source: null })}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
              >
                <UserPlus className="size-5" />
                Add New Person
              </button>
            )}
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {ROLES.map((role) => {
          const Icon = ICONS[role];
          return (
            <Card key={role} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 mb-1">{roleLabel(role)}</p>
                  {s ? (
                    <p className="text-2xl font-bold text-gray-900">{s[role].toLocaleString()}</p>
                  ) : stats.isError ? (
                    <p className="text-2xl font-bold text-gray-400" title={errorText(stats.error)}>—</p>
                  ) : (
                    <div className="h-8 w-12 animate-pulse rounded bg-gray-200" />
                  )}
                </div>
                <div className="bg-blue-100 p-2 rounded-full">
                  <Icon className="size-5 text-blue-600" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-4">
          <SearchInput
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Search ${roleLabel(tab)}s`}
          />
          <div className="flex gap-3 flex-wrap">
            {tab === "customer" && tagOptions.length > 0 && (
              <Select className={select} aria-label="Filter by tag" value={f.tag} onChange={(e) => setF({ tag: e.target.value })}>
                <option value="all">All Tags</option>
                {tagOptions.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name} ({t.customers})
                  </option>
                ))}
              </Select>
            )}
            <Select className={select} aria-label="Filter by status" value={f.status} onChange={(e) => setF({ status: e.target.value })}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>

        <PillTabs<PersonRole>
          value={tab}
          onChange={(next) => {
            setEditing(null);
            setF({ tab: next, tag: "all", open: "" });
          }}
          options={ROLES.map((role) => ({ value: role, label: `${roleLabel(role)} (${s ? s[role] : "…"})` }))}
        />
      </Card>

      {/* People table */}
      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No people found"
          description={hasFilters ? "Try adjusting your search or filters" : `No ${roleLabel(tab)}s have been added yet`}
        />
      ) : (
        <Card className="overflow-hidden" aria-busy={list.isFetching}>
          <PeopleTable role={tab} rows={rows} loading={list.isPending} canEdit={canEdit[tab]} onOpen={openRow} />
          {list.data && list.data.total_pages > 1 && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={(p) => setF({ page: String(p) })}
              disabled={list.isFetching}
            />
          )}
        </Card>
      )}

      {/* Customer details */}
      {tab === "customer" && openId !== null && Number.isFinite(openId) && (
        <CustomerDetailModal
          customerId={openId}
          onClose={() => {
            setF({ open: "" });
            refreshPeople();
          }}
        />
      )}

      {campaignOpen && <CampaignTargetingModal onClose={() => setCampaignOpen(false)} />}

      {editing && <EditModal editing={editing} onClose={() => setEditing(null)} onVendorClose={refreshPeople} />}
    </PageContainer>
  );
}

/** Add / edit modal for the tab's person type. */
function EditModal({
  editing,
  onClose,
  onVendorClose,
}: {
  editing: NonNullable<Editing>;
  onClose: () => void;
  onVendorClose: () => void;
}) {
  const { role, source } = editing;
  switch (role) {
    case "customer":
      return <CustomerFormModal customer={source?.kind === "customer" ? source.data : null} onClose={onClose} />;
    case "staff":
    case "driver":
      return (
        <StaffFormModal
          member={source?.kind === "staff" || source?.kind === "driver" ? source.data : null}
          driver={role === "driver"}
          onClose={onClose}
        />
      );
    case "shipper":
      return <ShipperEditModal shipper={source?.kind === "shipper" ? source.data : null} onClose={onClose} />;
    case "shop_vendor":
      return (
        <VendorModal
          vendor={source?.kind === "shop_vendor" ? source.data : null}
          onClose={() => {
            onVendorClose();
            onClose();
          }}
        />
      );
    case "service_provider":
      return <ServiceProviderModal provider={source?.kind === "service_provider" ? source.data : null} onClose={onClose} />;
  }
}
