"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  Edit,
  ExternalLink,
  History,
  Image as ImageIcon,
  MapPin,
  Package,
  Percent,
  ShoppingCart,
  Store,
  Upload,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useCities } from "@/components/shipping-engine/hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { PillTabs, UnderlineTabs } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import { catalogApi, catalogKeys, type Vendor } from "@/lib/api/services/catalog";
import { marketplaceApi, marketplaceKeys } from "@/lib/api/services/marketplace";
import { productsApi, productKeys } from "@/lib/api/services/products";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatTSh } from "@/lib/format";

import {
  APPROVAL_LABEL,
  ApprovalBadge,
  CommissionTerms,
  FulfillmentBadge,
  InfoItem,
  PAYOUT_METHOD,
  ReviewStatusBadge,
  SellerKindTag,
  SettlementBadge,
  VendorLogo,
  payoutAccountText,
} from "./marketplace-ui";
import { ProductModerationButtons } from "./products/product-moderation";
import { PayoutModal, PayoutsTable, useCanRecordPayout } from "./payouts";
import { SectionHeader, compactAmount, useCatalogAccess, useCatalogMutation } from "./shared";
import { ProfitAgreementModal, VendorModal } from "./vendor-modals";
import { VendorReviewActions } from "./vendor-review";

type ProfileTab = "overview" | "products" | "orders" | "earnings" | "history";
const TABS: { value: ProfileTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "products", label: "Products" },
  { value: "orders", label: "Orders" },
  { value: "earnings", label: "Earnings & Payouts" },
  { value: "history", label: "History" },
];
const isTab = (v: string): v is ProfileTab => TABS.some((t) => t.value === v);

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const cardTitle = "text-lg font-semibold text-gray-900";

const BUSINESS_TYPE: Record<string, string> = { individual: "Individual / sole trader", company: "Registered company" };


/**
 * A vendor's profile inside the Vendors section (`?section=vendors&vendor=<id>`,
 * the link AGIZA's notifications use): store header, review actions and tabs
 * for business details, products, orders, earnings/payouts and history.
 */
export function VendorProfile({
  vendorId,
  tab: rawTab,
  onTab,
  onBack,
}: {
  vendorId: number;
  tab: string;
  onTab: (tab: string) => void;
  onBack: () => void;
}) {
  const { canEdit } = useCatalogAccess();
  const tab: ProfileTab = isTab(rawTab) ? rawTab : "overview";
  const vendor = useQuery({ queryKey: catalogKeys.vendor(vendorId), queryFn: ({ signal }) => catalogApi.vendors.get(vendorId, signal) });
  const [editing, setEditing] = useState(false);
  const [agreement, setAgreement] = useState(false);
  const v = vendor.data;

  if (!v) {
    const notFound = vendor.error instanceof ApiError && vendor.error.status === 404;
    return (
      <>
        <SectionHeader title="Vendor" description="Vendor profile" onBack={onBack} backLabel="Back to vendors" />
        {vendor.isError ? (
          notFound ? (
            <EmptyState icon={Store} title="Vendor not found" description="It may have been deleted." />
          ) : (
            <ErrorState message={errorText(vendor.error)} onRetry={() => vendor.refetch()} />
          )
        ) : (
          <Card className="overflow-hidden" aria-busy="true">
            <Skeleton className="h-40 rounded-none" />
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          </Card>
        )}
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title={v.name}
        description={`${v.reference} · ${v.self_service ? "Self-service store" : "Staff-managed vendor"}`}
        onBack={onBack}
        backLabel="Back to vendors"
        actions={
          canEdit && (
            <>
              <Button variant="outline" size="lg" onClick={() => setAgreement(true)}>
                <Percent className="size-5" /> Edit Agreement
              </Button>
              {!v.self_service && (
                <Button size="lg" onClick={() => setEditing(true)}>
                  <Edit className="size-5" /> Edit Vendor
                </Button>
              )}
            </>
          )
        }
      />

      <ProfileHeader vendor={v} canEdit={canEdit} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard label="Products" value={v.products_count} icon={Package} tone="blue" />
        <StatCard label="Pending Review" value={v.pending_products} icon={Clock} tone={v.pending_products > 0 ? "orange" : "gray"} />
        <StatCard label="Orders" value={v.orders_count} icon={ShoppingCart} tone="green" />
        <StatCard
          label="Total Sales"
          value={<span title={formatTSh(v.total_sales)}>TSh {compactAmount(v.total_sales)}</span>}
          icon={DollarSign}
          tone="purple"
          compactValue
        />
      </div>

      <Card className="overflow-hidden">
        <UnderlineTabs className="px-4 pt-2" options={TABS} value={tab} onChange={(t) => onTab(t === "overview" ? "" : t)} />
        <div className={cn(tab === "overview" && "p-6")}>
          {tab === "overview" && <Overview vendor={v} />}
          {tab === "products" && <VendorProducts vendor={v} canEdit={canEdit} />}
          {tab === "orders" && <VendorOrders vendorId={v.id} />}
          {tab === "earnings" && <VendorEarnings vendor={v} />}
          {tab === "history" && <VendorHistory vendorId={v.id} />}
        </div>
      </Card>

      {editing && <VendorModal vendor={v} onClose={() => setEditing(false)} />}
      {agreement && <ProfitAgreementModal vendor={v} onClose={() => setAgreement(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ header */

function MediaUpload({ vendor, kind, className }: { vendor: Vendor; kind: "logo" | "banner"; className?: string }) {
  const upload = useCatalogMutation((file: File) => catalogApi.vendors.uploadMedia(vendor.id, kind, file), {
    success: kind === "logo" ? "Logo updated" : "Banner updated",
  });
  const id = `vendor-${vendor.id}-${kind}`;
  const has = kind === "logo" ? vendor.logo_url : vendor.banner_url;
  return (
    <>
      <input
        id={id}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload.mutate(file);
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-white/90 border border-gray-300 text-gray-700 hover:bg-white",
          upload.isPending && "opacity-60 cursor-wait",
          className,
        )}
      >
        {upload.isPending ? <Clock className="size-4 animate-pulse" /> : kind === "logo" ? <Upload className="size-4" /> : <ImageIcon className="size-4" />}
        {upload.isPending ? "Uploading…" : `${has ? "Change" : "Upload"} ${kind}`}
      </label>
    </>
  );
}

function ProfileHeader({ vendor: v, canEdit }: { vendor: Vendor; canEdit: boolean }) {
  const noteTone =
    v.approval_status === "rejected" || v.approval_status === "suspended"
      ? "bg-red-50 border-red-200 text-red-800"
      : v.approval_status === "changes_requested"
        ? "bg-orange-50 border-orange-200 text-orange-800"
        : "bg-gray-50 border-gray-200 text-gray-700";
  const needsCity = v.self_service && !v.city && (v.approval_status === "pending" || v.approval_status === "under_review");

  return (
    <Card className="overflow-hidden mb-6">
      <div className="relative h-36 sm:h-44 bg-gradient-to-r from-indigo-100 via-blue-50 to-blue-100">
        {v.banner_url && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL
          <img src={fileSrc(`${v.banner_url}?v=${encodeURIComponent(v.updated_at)}`)} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        {canEdit && <MediaUpload vendor={v} kind="banner" className="absolute top-3 right-3" />}
      </div>
      <div className="px-6 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 pt-4">
          <div className="rounded-xl ring-4 ring-white bg-white w-fit relative -mt-14 flex-shrink-0">
            <VendorLogo vendor={v} size="lg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">{v.name}</h2>
              {v.verified && <BadgeCheck className="size-6 text-blue-600" aria-label="Verified vendor" />}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-600">
              <ApprovalBadge status={v.approval_status} />
              <SellerKindTag selfService={v.self_service} />
              {v.status === "inactive" && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">Inactive</span>}
              {(v.city_name || v.location) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4 text-gray-400" /> {v.city_name || v.location}
                </span>
              )}
              {v.joined_date && <span>· Joined {formatDate(v.joined_date)}</span>}
            </div>
          </div>
          {canEdit && <MediaUpload vendor={v} kind="logo" />}
        </div>

        <div className="mt-6 pt-5 border-t border-gray-200 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h3 className={cardTitle}>{v.self_service ? "Application & account status" : "Account status"}</h3>
            <p className="text-sm text-gray-600">
              {v.submitted_at && <>Submitted {formatDateTime(v.submitted_at)}</>}
              {v.submitted_at && v.reviewed_at && " · "}
              {v.reviewed_at && <>Last reviewed {formatDateTime(v.reviewed_at)}</>}
              {!v.submitted_at && !v.reviewed_at && <>Status: {APPROVAL_LABEL[v.approval_status]}</>}
            </p>
            {v.review_note && (
              <div className={cn("border rounded-lg px-4 py-3 text-sm max-w-2xl", noteTone)}>
                <p className="font-semibold mb-0.5">Review note</p>
                <p className="whitespace-pre-line">{v.review_note}</p>
              </div>
            )}
            {needsCity && canEdit && <CityFix vendor={v} />}
          </div>
          {canEdit && (
            <div className="flex-shrink-0">
              <VendorReviewActions vendor={v} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Approval needs the vendor's city (where AGIZA collects their orders). */
function CityFix({ vendor }: { vendor: Vendor }) {
  const cities = useCities();
  const [city, setCity] = useState("");
  const save = useCatalogMutation((id: number) => catalogApi.vendors.update(vendor.id, { city: id }), { success: "City saved" });
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 max-w-2xl">
      <p className="mb-2">Set the vendor&apos;s city before approving: it is where AGIZA collects their orders.</p>
      <div className="flex flex-wrap gap-2">
        <Select className="w-full sm:w-64" aria-label="Vendor city" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">{cities.isPending ? "Loading cities…" : "Select a city"}</option>
          {(cities.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button disabled={!city} loading={save.isPending} onClick={() => save.mutate(Number(city))}>
          Save City
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview({ vendor: v }: { vendor: Vendor }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <section className="border border-gray-200 rounded-lg p-5">
        <h3 className={cn(cardTitle, "mb-4")}>Business information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoItem label="Store name">{v.name}</InfoItem>
          <InfoItem label="Legal name">{v.legal_name}</InfoItem>
          <InfoItem label="Business type">{BUSINESS_TYPE[v.business_type] ?? v.business_type}</InfoItem>
          <InfoItem label="Registration no.">{v.registration_number}</InfoItem>
          <InfoItem label="TIN">{v.tin}</InfoItem>
          <InfoItem label="City">{v.city_name ?? v.location}</InfoItem>
          <InfoItem label="Business address" wide>
            {v.business_address}
          </InfoItem>
          <InfoItem label="Contact person">{v.contact_person}</InfoItem>
          <InfoItem label="Phone">{v.phone}</InfoItem>
          <InfoItem label="Email" wide>
            {v.email}
          </InfoItem>
          <InfoItem label="Description" wide>
            {v.description && <span className="whitespace-pre-line font-normal text-gray-700">{v.description}</span>}
          </InfoItem>
        </div>
      </section>

      <div className="space-y-6">
        <section className="border border-gray-200 rounded-lg p-5">
          <h3 className={cn(cardTitle, "mb-4")}>Owner account</h3>
          {v.owner ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoItem label="Name">{v.owner.name}</InfoItem>
              <InfoItem label="Phone">{v.owner.phone}</InfoItem>
              <InfoItem label="Customer reference">{v.owner.reference}</InfoItem>
              <div className="flex items-end">
                <Link
                  href={`/people?tab=customer&open=${v.owner.customer_id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  Open customer <ExternalLink className="size-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">Staff-managed vendor — AGIZA manages this vendor&apos;s products and stock; there is no owner account.</p>
          )}
        </section>

        <section className="border border-gray-200 rounded-lg p-5">
          <h3 className={cn(cardTitle, "mb-4")}>Payout details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem label="Method">{PAYOUT_METHOD[v.payout_method] ?? v.payout_method}</InfoItem>
            <InfoItem label="Provider / bank">{v.payout_provider}</InfoItem>
            <InfoItem label="Account name">{v.payout_account_name}</InfoItem>
            <InfoItem label="Account number">{v.payout_account_number && <span className="font-mono">{v.payout_account_number}</span>}</InfoItem>
          </div>
        </section>

        <section className="border border-gray-200 rounded-lg p-5">
          <h3 className={cn(cardTitle, "mb-4")}>Commission & store</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem label="Commission" wide>
              <div className="mt-1">
                <CommissionTerms vendor={v} />
              </div>
            </InfoItem>
            <InfoItem label="Store location">
              {v.warehouse && (
                <>
                  {v.warehouse.name} <span className="text-xs text-gray-500 font-mono">({v.warehouse.code})</span>
                </>
              )}
            </InfoItem>
            <InfoItem label="Store link">{v.slug && <span className="font-mono text-sm">{v.slug}</span>}</InfoItem>
            <InfoItem label="Rating">{v.rating !== null && v.rating !== undefined ? `${Number(v.rating).toFixed(1)} / 5` : null}</InfoItem>
            <InfoItem label="Created">{formatDate(v.created_at)}</InfoItem>
            {v.notes && (
              <InfoItem label="Internal notes" wide>
                <span className="whitespace-pre-line font-normal text-gray-700">{v.notes}</span>
              </InfoItem>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- products */

function VendorProducts({ vendor, canEdit }: { vendor: Vendor; canEdit: boolean }) {
  const [review, setReview] = useState("all");
  const [page, setPage] = useState(1);
  const query = { seller: String(vendor.id), review_status: review, page, page_size: 10 };
  const list = useQuery({
    queryKey: productKeys.list(query),
    queryFn: ({ signal }) => productsApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const productHref = (id?: number) =>
    `/ecommerce?section=products&seller=${vendor.id}${id ? `&product=${id}` : ""}`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-gray-200">
        <PillTabs
          value={review}
          onChange={(v) => {
            setReview(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: `Pending review${vendor.pending_products ? ` (${vendor.pending_products})` : ""}`, activeClass: "bg-amber-600" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "disabled", label: "Disabled" },
          ]}
        />
        <Link href={productHref()} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">
          Open in Products Management <ExternalLink className="size-3.5" />
        </Link>
      </div>
      {list.isError && !list.data ? (
        <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState bare icon={Package} title="No products" description={review === "all" ? "This vendor hasn't listed any products yet." : "No products with this review status."} />
      ) : (
        <>
          <Table>
            <THead>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th>Price</Th>
              <Th>Stock</Th>
              <Th>Status</Th>
              <Th>Review</Th>
              <Th>Actions</Th>
            </THead>
            <TBody>
              {list.isPending ? (
                <TableSkeletonRows rows={4} columns={7} />
              ) : (
                rows.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL
                          <img src={fileSrc(p.image)} alt="" loading="lazy" className="size-10 rounded-lg object-cover border border-gray-200" />
                        ) : (
                          <div className="size-10 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center" aria-hidden>
                            <ImageIcon className="size-4 text-gray-300" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 max-w-64 truncate" title={p.name}>
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">{p.sku}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-sm text-gray-600">{p.category?.name ?? "—"}</Td>
                    <Td className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatTSh(p.price)}</Td>
                    <Td className="text-sm text-gray-700">{p.stock.toLocaleString("en-US")}</Td>
                    <Td className="text-sm text-gray-700 whitespace-nowrap">{p.status_display}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        {p.review_status === "not_required" ? <span className="text-xs text-gray-400">Not required</span> : <ReviewStatusBadge status={p.review_status} label={p.review_status_display} />}
                        {p.review_note && (
                          <span className="text-xs text-gray-500 max-w-48 line-clamp-2" title={p.review_note}>
                            {p.review_note}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <Link
                          href={productHref(p.id)}
                          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                        >
                          Open
                        </Link>
                        {canEdit && <ProductModerationButtons product={p} />}
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
          {list.data && list.data.total_pages > 1 && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={setPage}
              disabled={list.isFetching}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ orders */

export function orderHref(orderId: number, reference: string) {
  return `/orders/ecommerce?search=${encodeURIComponent(reference)}&open=${orderId}`;
}

function VendorOrders({ vendorId }: { vendorId: number }) {
  const [settlement, setSettlement] = useState("all");
  const [page, setPage] = useState(1);
  const query = { vendor: vendorId, settlement_status: settlement, page, page_size: 10 };
  const list = useQuery({
    queryKey: marketplaceKeys.fulfillments(query),
    queryFn: ({ signal }) => marketplaceApi.fulfillments(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-gray-200">
        <p className="text-sm text-gray-600">This vendor&apos;s part of each customer order, with AGIZA&apos;s commission and the vendor&apos;s net earnings.</p>
        <Select
          className="w-full sm:w-auto"
          aria-label="Filter by settlement"
          value={settlement}
          onChange={(e) => {
            setSettlement(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Any settlement</option>
          <option value="pending">Pending</option>
          <option value="payable">Payable</option>
          <option value="settled">Paid out</option>
          <option value="void">Void</option>
        </Select>
      </div>
      {list.isError && !list.data ? (
        <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : !list.isPending && rows.length === 0 ? (
        <EmptyState bare icon={ShoppingCart} title="No orders yet" description="Orders containing this vendor's products appear here." />
      ) : (
        <>
          <Table>
            <THead>
              <Th>Order</Th>
              <Th>Status</Th>
              <Th>Items</Th>
              <Th>Gross</Th>
              <Th>Commission</Th>
              <Th>Net</Th>
              <Th>Settlement</Th>
            </THead>
            <TBody>
              {list.isPending ? (
                <TableSkeletonRows rows={4} columns={7} />
              ) : (
                rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={orderHref(r.order_id, r.order_reference)} className="font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap">
                        {r.order_reference}
                      </Link>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {r.customer} · {formatDate(r.created_at)}
                      </div>
                    </Td>
                    <Td>
                      <FulfillmentBadge status={r.status} label={r.status_display} />
                    </Td>
                    <Td className="text-sm text-gray-700">{r.item_count}</Td>
                    <Td className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatTSh(r.subtotal)}</Td>
                    <Td className="text-sm text-gray-700 whitespace-nowrap">{formatTSh(r.commission)}</Td>
                    <Td className="text-sm font-semibold text-green-700 whitespace-nowrap">{formatTSh(r.vendor_net)}</Td>
                    <Td>
                      <SettlementBadge status={r.settlement_status} title={r.settlement_display} />
                      {r.payout && <div className="text-xs text-gray-500 font-mono mt-1">{r.payout}</div>}
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
          {list.data && list.data.total_pages > 1 && (
            <Pagination
              page={list.data.page}
              pageSize={list.data.page_size}
              count={list.data.count}
              totalPages={list.data.total_pages}
              onPageChange={setPage}
              disabled={list.isFetching}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- earnings */

function VendorEarnings({ vendor }: { vendor: Vendor }) {
  const canPay = useCanRecordPayout();
  const [paying, setPaying] = useState(false);
  const earnings = useQuery({
    queryKey: marketplaceKeys.earnings({ vendor: vendor.id }),
    queryFn: ({ signal }) => marketplaceApi.earnings({ vendor: vendor.id }, signal),
  });
  const row = earnings.data?.vendors.find((r) => r.vendor.id === vendor.id);
  const zero = "0.00";
  const figures = [
    { label: "Gross Sales", value: row?.gross_sales ?? zero, icon: DollarSign, tone: "blue" as const },
    { label: "AGIZA Commission", value: row?.commission ?? zero, icon: Percent, tone: "purple" as const },
    { label: "Vendor Net", value: row?.vendor_net ?? zero, icon: Wallet, tone: "green" as const },
    { label: "Pending", value: row?.pending ?? zero, icon: Clock, tone: "yellow" as const },
    { label: "Payable", value: row?.payable ?? zero, icon: CreditCard, tone: "orange" as const },
    { label: "Paid Out", value: row?.paid_out ?? zero, icon: CheckCircle, tone: "gray" as const },
  ];
  const payable = Number(row?.payable ?? 0);

  return (
    <div>
      <div className="p-6 border-b border-gray-200">
        {earnings.isError && !earnings.data ? (
          <ErrorState bare message={errorText(earnings.error)} onRetry={() => earnings.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {figures.map((f) => (
                <StatCard
                  key={f.label}
                  label={f.label}
                  value={<span title={formatTSh(f.value)}>TSh {compactAmount(f.value)}</span>}
                  icon={f.icon}
                  tone={f.tone}
                  loading={earnings.isPending}
                  compactValue
                />
              ))}
            </div>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-gray-600">
                Earnings become payable once an order is delivered and fully paid.
                {payoutAccountText(vendor) && (
                  <>
                    {" "}
                    Payout account: <span className="font-medium text-gray-900">{payoutAccountText(vendor)}</span>
                  </>
                )}
              </p>
              {canPay && payable > 0 && (
                <Button onClick={() => setPaying(true)}>
                  <Wallet className="size-4" /> Record Payout
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <h3 className={cn(cardTitle, "px-6 pt-5 pb-3")}>Payout history</h3>
      <PayoutsTable vendorId={vendor.id} />
      {paying && row && (
        <PayoutModal vendor={{ id: vendor.id, name: vendor.name }} payable={row.payable} payoutAccount={payoutAccountText(vendor)} onClose={() => setPaying(false)} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- history */

function VendorHistory({ vendorId }: { vendorId: number }) {
  const history = useQuery({ queryKey: catalogKeys.vendorHistory(vendorId), queryFn: ({ signal }) => catalogApi.vendors.history(vendorId, signal) });
  if (history.isError) return <ErrorState bare message={errorText(history.error)} onRetry={() => history.refetch()} />;
  if (history.isPending) {
    return (
      <div className="p-6 space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (!history.data.length) return <EmptyState bare icon={History} title="No history yet" description="Application and account status changes appear here." />;
  return (
    <ol className="p-6 space-y-0">
      {history.data.map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative pl-8 pb-6 last:pb-0">
          {i < history.data.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-gray-200" aria-hidden />}
          <span className="absolute left-0 top-1 size-6 rounded-full bg-blue-100 flex items-center justify-center" aria-hidden>
            <span className="size-2 rounded-full bg-blue-600" />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ApprovalBadge status={h.to_status} />
            {h.from_status && (
              <span className="text-xs text-gray-500">
                from {APPROVAL_LABEL[h.from_status as keyof typeof APPROVAL_LABEL] ?? h.from_status}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {h.by} · {formatDateTime(h.at)}
          </p>
          {h.note && <p className="text-sm text-gray-800 mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 whitespace-pre-line">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}
