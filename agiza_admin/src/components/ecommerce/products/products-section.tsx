"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Clock, Edit, Eye, Image as ImageIcon, Package, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchInput, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/pagination";
import { ErrorState } from "@/components/ui/states";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { can, useMe } from "@/hooks/use-me";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { ApiError } from "@/lib/api/client";
import { errorText } from "@/lib/api/errors";
import { fileSrc } from "@/lib/api/files";
import {
  LOOKUP_STALE,
  PRODUCT_STATUSES,
  productKeys,
  productLookups,
  productsApi,
  type ProductRow,
} from "@/lib/api/services/products";
import { cn } from "@/lib/cn";

import { ReviewStatusBadge, SellerKindTag } from "../marketplace-ui";

import { LABEL_COLORS, ProductEditor } from "./product-editor";
import { ProductModerationButtons } from "./product-moderation";

const th = "text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap";
const PAGE_SIZE = 20;

function StockText({ p }: { p: ProductRow }) {
  if (p.stock <= 0) return <span className="text-red-600 font-semibold text-xs whitespace-nowrap">Out of Stock</span>;
  if (p.stock <= p.low_stock_threshold) return <span className="text-orange-600 font-semibold text-xs whitespace-nowrap">{p.stock.toLocaleString("en-US")} left</span>;
  return <span className="text-gray-700 text-xs whitespace-nowrap">{p.stock.toLocaleString("en-US")} units</span>;
}

function StatusPill({ p }: { p: ProductRow }) {
  const tone =
    p.status === "active"
      ? "bg-green-100 text-green-700"
      : p.status === "draft"
        ? "bg-yellow-100 text-yellow-700"
        : p.status === "out_of_stock"
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-500";
  return <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap", tone)}>{p.status_display}</span>;
}

/**
 * Products Management: filter card, products table, pagination and the
 * product editor. The E-commerce shell renders the page header above it.
 */
export function ProductsSection() {
  const me = useMe();
  const canEdit = can(me.data, "ecommerce", "edit");
  const canDelete = can(me.data, "ecommerce", "manage");

  const [f, setF] = useUrlFilters({ q: "", cat: "all", pstatus: "all", seller: "all", review: "all", page: "1", product: "" });
  const [search, setSearch] = useState(f.q);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
  }, [debounced, f.q, setF]);

  const query = {
    search: f.q,
    category: f.cat,
    status: f.pstatus,
    seller: f.seller,
    review_status: f.review,
    page: Number(f.page) || 1,
    page_size: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: productKeys.list(query),
    queryFn: ({ signal }) => productsApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({ queryKey: productKeys.lookup("categories"), queryFn: productLookups.categories, staleTime: LOOKUP_STALE });
  const vendors = useQuery({ queryKey: productKeys.lookup("vendors"), queryFn: productLookups.vendors, staleTime: LOOKUP_STALE });
  const rows = list.data?.results ?? [];
  const filtered = Boolean(f.q || f.cat !== "all" || f.pstatus !== "all" || f.seller !== "all" || f.review !== "all");
  const pendingQuery = { review_status: "pending", page_size: 1 };
  const pendingReview = useQuery({
    queryKey: productKeys.list(pendingQuery),
    queryFn: ({ signal }) => productsApi.list(pendingQuery, signal),
  });
  const pendingCount = pendingReview.data?.count ?? 0;
  const knownSeller = ["all", "agiza", "vendors"].includes(f.seller) || (vendors.data ?? []).some((v) => String(v.id) === f.seller);

  // If the current page disappears (e.g. after deleting its last row), go back one.
  useEffect(() => {
    if (list.data && list.data.results.length === 0 && list.data.page > 1 && list.data.count > 0) setF({ page: String(list.data.total_pages) });
  }, [list.data, setF]);

  const openEditor = (value: string) => setF({ product: value, page: f.page });
  const editorId = f.product === "new" ? null : f.product ? Number(f.product) : undefined;

  /* ---- delete (409 → offer Inactive) ---- */
  const [toDelete, setToDelete] = useState<ProductRow | null>(null);
  const [blocked, setBlocked] = useState<{ row: ProductRow; message: string } | null>(null);
  const remove = useApiMutation((p: ProductRow) => productsApi.remove(p.id), {
    invalidate: [productKeys.all],
    success: "Product deleted",
    onSuccess: () => setToDelete(null),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && toDelete) {
        setBlocked({ row: toDelete, message: err.message });
        setToDelete(null);
      } else {
        setToDelete(null);
        toast.error(errorText(err));
      }
    },
  });
  const deactivate = useApiMutation((p: ProductRow) => productsApi.update(p.id, { status: "inactive" }), {
    invalidate: [productKeys.all],
    success: (d) => `${d.name} set to Inactive`,
    onSuccess: () => setBlocked(null),
  });

  const top = (categories.data ?? []).filter((c) => c.parent === null);

  return (
    <div>
      {canEdit && (
        <div className="flex justify-end mb-6">
          <button
            type="button"
            onClick={() => openEditor("new")}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
          >
            <Plus className="size-5" />
            Add New Product
          </button>
        </div>
      )}

      {pendingCount > 0 && f.review !== "pending" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <Clock className="size-4 flex-shrink-0" />
            {pendingCount} vendor product{pendingCount === 1 ? " is" : "s are"} waiting for review.
          </span>
          <button type="button" onClick={() => setF({ review: "pending", seller: "all" })} className="font-semibold text-amber-900 hover:underline">
            Review now
          </button>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 sm:p-6 mb-6">
        <div className="flex flex-col 2xl:flex-row gap-4 items-start 2xl:items-center justify-between">
          <SearchInput
            placeholder="Search products by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products by name or SKU"
          />
          <div className="flex gap-3 flex-wrap w-full 2xl:w-auto">
            <Select className="w-full sm:w-auto" aria-label="Filter by category" value={f.cat} onChange={(e) => setF({ cat: e.target.value })}>
              <option value="all">All Categories</option>
              {top.map((c) => {
                const subs = (categories.data ?? []).filter((s) => s.parent === c.id);
                return [
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>,
                  ...subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {"   "}
                      {s.name}
                    </option>
                  )),
                ];
              })}
            </Select>
            <Select className="w-full sm:w-auto" aria-label="Filter by status" value={f.pstatus} onChange={(e) => setF({ pstatus: e.target.value })}>
              <option value="all">All Statuses</option>
              {PRODUCT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select className="w-full sm:w-auto" aria-label="Filter by seller" value={f.seller} onChange={(e) => setF({ seller: e.target.value })}>
              <option value="all">All Sellers</option>
              <option value="agiza">Sold by AGIZA</option>
              <option value="vendors">All Vendors</option>
              {!knownSeller && <option value={f.seller}>Vendor #{f.seller}</option>}
              {(vendors.data ?? []).length > 0 && (
                <optgroup label="Vendor">
                  {(vendors.data ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            <Select className="w-full sm:w-auto" aria-label="Filter by review status" value={f.review} onChange={(e) => setF({ review: e.target.value })}>
              <option value="all">Any Review Status</option>
              <option value="pending">Pending review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="disabled">Disabled</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Products list */}
      {list.isError && !list.data ? (
        <ErrorState message={errorText(list.error)} onRetry={() => list.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={cn(th, "w-12")}>
                    <span className="sr-only">Image</span>
                  </th>
                  <th className={th}>Product</th>
                  <th className={th}>SKU</th>
                  <th className={th}>Category</th>
                  <th className={th}>Seller</th>
                  <th className={th}>Price</th>
                  <th className={th}>Stock</th>
                  <th className={th}>Origin</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody className={cn(list.isFetching && !list.isPending && "opacity-60 transition-opacity")}>
                {list.isPending
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-4 py-3">
                          <div className="size-11 rounded-lg bg-gray-200 animate-pulse" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
                          <div className="mt-1.5 h-3 w-24 rounded bg-gray-100 animate-pulse" />
                        </td>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows.map((p) => (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element -- authenticated proxy URL
                            <img src={fileSrc(p.image)} alt={p.name} loading="lazy" className="size-11 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                          ) : (
                            <div className="size-11 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center" aria-hidden>
                              <ImageIcon className="size-5 text-gray-300" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 min-w-52 max-w-64">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-900 leading-snug">{p.name}</span>
                            {p.brand && <span className="text-xs text-blue-600 font-medium mt-0.5">{p.brand.name}</span>}
                            {p.description && <span className="text-xs text-gray-400 mt-0.5 line-clamp-1">{p.description}</span>}
                            {(p.labels.length > 0 || p.variants_count > 0) && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {p.labels.map((l) => (
                                  <span key={l.id} className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", LABEL_COLORS[l.color])}>
                                    {l.name}
                                  </span>
                                ))}
                                {p.variants_count > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                    {p.variants_count} variation{p.variants_count === 1 ? "" : "s"}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap">{p.sku}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{p.category?.name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className={cn("text-xs font-medium whitespace-nowrap", p.seller?.id ? "text-gray-900" : "text-blue-700")}>{p.seller?.name ?? "AGIZA"}</span>
                            {p.seller?.id && <SellerKindTag selfService={p.seller.self_service} />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-blue-600 whitespace-nowrap">TSh {Number(p.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StockText p={p} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.origin || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <StatusPill p={p} />
                            <ReviewStatusBadge status={p.review_status} label={p.review_status_display} />
                            {p.review_note && (p.review_status === "rejected" || p.review_status === "disabled") && (
                              <span className="text-[11px] text-gray-500 max-w-40 line-clamp-2" title={p.review_note}>
                                {p.review_note}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditor(String(p.id))}
                              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                              aria-label={`${canEdit ? "Edit" : "View"} ${p.name}`}
                            >
                              {canEdit ? <Edit className="size-3.5" /> : <Eye className="size-3.5" />}
                              {canEdit ? "Edit" : "View"}
                            </button>
                            {canEdit && <ProductModerationButtons product={p} />}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setToDelete(p)}
                                className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                                aria-label={`Delete ${p.name}`}
                                title="Delete"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!list.isPending && rows.length === 0 && (
            <div className="py-16 text-center text-gray-400">
              <Package className="size-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No products found</p>
              <p className="text-sm mt-1">{filtered ? "Try adjusting your search or filters" : "Add your first product to start selling."}</p>
              {!filtered && canEdit && (
                <button type="button" onClick={() => openEditor("new")} className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium text-sm">
                  <Plus className="size-4" /> Add New Product
                </button>
              )}
            </div>
          )}
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

      {editorId !== undefined && <ProductEditor key={f.product} productId={editorId} onClose={() => openEditor("")} />}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete product"
        tone="danger"
        confirmLabel="Delete Product"
        pending={remove.isPending}
        message={
          <>
            Delete <strong>{toDelete?.name}</strong> ({toDelete?.sku})? Its images and variations are removed too. This can&apos;t be undone.
          </>
        }
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onClose={() => !remove.isPending && setToDelete(null)}
      />

      <ConfirmDialog
        open={blocked !== null}
        title="Can't delete this product"
        confirmLabel="Set to Inactive"
        pending={deactivate.isPending}
        message={
          <>
            <p>{blocked?.message}</p>
            <p className="mt-2 text-sm text-gray-500">Setting it to Inactive hides it from the store while keeping its order and stock history.</p>
          </>
        }
        onConfirm={() => blocked && deactivate.mutate(blocked.row)}
        onClose={() => !deactivate.isPending && setBlocked(null)}
      />
    </div>
  );
}
