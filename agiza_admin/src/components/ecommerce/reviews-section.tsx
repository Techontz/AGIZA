"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgeCheck, EyeOff, Flag, MessageSquare, Send, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FormAlert, mergedErrors } from "@/components/deliveries/form-helpers";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SearchInput, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TBody, THead, Table, TableSkeletonRows, Td, Th, Tr } from "@/components/ui/table";
import { PillTabs } from "@/components/ui/tabs";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorText } from "@/lib/api/errors";
import { marketplaceApi, marketplaceKeys, type ProductReviewRow, type ProductReviewStatus } from "@/lib/api/services/marketplace";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

import { useCatalogAccess } from "./shared";

const STATUS_TONE: Record<ProductReviewStatus, BadgeTone> = {
  published: "green",
  pending: "amber",
  flagged: "red",
  hidden: "gray",
};

type StatusTab = "all" | ProductReviewStatus;
const TABS: { value: StatusTab; label: string; activeClass?: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published", activeClass: "bg-green-600" },
  { value: "pending", label: "Waiting for approval", activeClass: "bg-amber-600" },
  { value: "flagged", label: "Flagged", activeClass: "bg-red-600" },
  { value: "hidden", label: "Hidden", activeClass: "bg-gray-600" },
];
const isTab = (v: string): v is StatusTab => TABS.some((t) => t.value === v);

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-4", n <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300")} aria-hidden />
      ))}
    </span>
  );
}

/**
 * Reviews moderation (`?section=reviews&status=flagged`): customer reviews of
 * products, with sellers' replies and flags. Staff publish or hide them.
 */
export function ReviewsSection({
  f,
  setF,
}: {
  f: { status: string; rating: string; rq: string; rpage: string };
  setF: (patch: Partial<{ status: string; rating: string; rq: string; rpage: string }>) => void;
}) {
  const { canEdit } = useCatalogAccess();
  const status: StatusTab = isTab(f.status) ? f.status : "all";
  const [search, setSearch] = useState(f.rq);
  const debounced = useDebouncedValue(search);
  useEffect(() => {
    if (debounced !== f.rq) setF({ rq: debounced, rpage: "" });
  }, [debounced, f.rq, setF]);
  const [moderating, setModerating] = useState<{ review: ProductReviewRow; action: "publish" | "hide" } | null>(null);

  const query = { status, rating: f.rating || "all", search: f.rq, page: Number(f.rpage || 1), page_size: 20 };
  const list = useQuery({
    queryKey: marketplaceKeys.reviews(query),
    queryFn: ({ signal }) => marketplaceApi.reviews.list(query, signal),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? [];
  const headers = ["Product", "Customer", "Rating", "Review", "Status", "Date", ...(canEdit ? ["Actions"] : [])];
  const filtered = status !== "all" || Boolean(f.rating) || Boolean(f.rq);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4">
          <PillTabs<StatusTab> value={status} onChange={(t) => setF({ status: t === "all" ? "" : t, rpage: "" })} options={TABS} />
        </div>
        <div className="flex flex-col md:flex-row gap-3 md:items-center pt-4 border-t border-gray-200">
          <SearchInput placeholder="Search by product, customer or review text..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search reviews" />
          <Select className="w-full md:w-auto bg-white" aria-label="Filter by rating" value={f.rating || "all"} onChange={(e) => setF({ rating: e.target.value === "all" ? "" : e.target.value, rpage: "" })}>
            <option value="all">Any rating</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} star{n === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {list.isError && !list.data ? (
          <ErrorState bare message={errorText(list.error)} onRetry={() => list.refetch()} />
        ) : !list.isPending && rows.length === 0 ? (
          <EmptyState
            bare
            icon={MessageSquare}
            title={filtered ? "No reviews match" : "No reviews yet"}
            description={filtered ? "Try a different status, rating or search." : "Customers can review products they received."}
          />
        ) : (
          <>
            <Table>
              <THead>
                {headers.map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </THead>
              <TBody>
                {list.isPending ? (
                  <TableSkeletonRows rows={5} columns={headers.length} />
                ) : (
                  rows.map((r) => (
                    <Tr key={r.id} className="align-top">
                      <Td>
                        <Link
                          href={`/ecommerce?section=products&product=${r.product.id}`}
                          className="font-semibold text-gray-900 hover:text-blue-600 block min-w-40 max-w-56 line-clamp-2"
                          title={r.product.name}
                        >
                          {r.product.name}
                        </Link>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Sold by{" "}
                          {r.vendor.id ? (
                            <Link href={`/ecommerce?section=vendors&vendor=${r.vendor.id}`} className="hover:text-blue-600">
                              {r.vendor.name}
                            </Link>
                          ) : (
                            <span className="text-blue-700 font-medium">AGIZA</span>
                          )}
                        </div>
                      </Td>
                      <Td className="text-sm text-gray-900 whitespace-nowrap">
                        {r.customer.name}
                        {r.verified_purchase && (
                          <div className="text-xs text-green-700 inline-flex items-center gap-1 mt-0.5">
                            <BadgeCheck className="size-3.5" /> Verified purchase
                          </div>
                        )}
                      </Td>
                      <Td>
                        <Stars rating={r.rating} />
                      </Td>
                      <Td>
                        <div className="min-w-72 max-w-md space-y-1.5">
                          {r.title && <p className="font-medium text-gray-900">{r.title}</p>}
                          {r.body ? <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-4">{r.body}</p> : !r.title && <p className="text-sm text-gray-400 italic">Rating only</p>}
                          {r.vendor_reply && (
                            <div className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                              <p className="text-xs font-semibold text-gray-600">Seller&apos;s reply</p>
                              <p className="text-gray-700 whitespace-pre-line">{r.vendor_reply}</p>
                            </div>
                          )}
                          {r.flag_reason && (
                            <p className="text-xs text-red-700 flex items-start gap-1">
                              <Flag className="size-3.5 mt-0.5 flex-shrink-0" /> Flagged by seller: {r.flag_reason}
                            </p>
                          )}
                          {r.moderation_note && (
                            <p className="text-xs text-gray-500 italic">
                              AGIZA{r.moderated_by ? ` (${r.moderated_by})` : ""}: {r.moderation_note}
                            </p>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[r.status] ?? "gray"}>{r.status_display}</Badge>
                      </Td>
                      <Td className="text-sm text-gray-600 whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                        {r.edited_at && <div className="text-xs text-gray-400">edited {formatDateTime(r.edited_at)}</div>}
                      </Td>
                      {canEdit && (
                        <Td>
                          <div className="flex flex-col gap-1.5">
                            {r.status !== "published" && (
                              <Button size="sm" variant="success" onClick={() => setModerating({ review: r, action: "publish" })}>
                                <Send className="size-4" /> Publish
                              </Button>
                            )}
                            {r.status !== "hidden" && (
                              <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => setModerating({ review: r, action: "hide" })}>
                                <EyeOff className="size-4" /> Hide
                              </Button>
                            )}
                          </div>
                        </Td>
                      )}
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
                onPageChange={(p) => setF({ rpage: String(p) })}
                disabled={list.isFetching}
              />
            )}
          </>
        )}
      </Card>

      {moderating && <ModerateModal review={moderating.review} action={moderating.action} onClose={() => setModerating(null)} />}
    </div>
  );
}

function ModerateModal({ review, action, onClose }: { review: ProductReviewRow; action: "publish" | "hide"; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const hide = action === "hide";
  const moderate = useApiMutation(() => marketplaceApi.reviews.moderate(review.id, { action, note: note.trim() }), {
    invalidate: [marketplaceKeys.all, ["catalog"]],
    success: (r) => `Review ${r.status === "hidden" ? "hidden" : "published"}`,
    onSuccess: onClose,
    onError: setError,
  });
  const submit = () => {
    if (hide && !note.trim()) return setLocal({ note: "Give the reason for hiding the review." });
    setLocal({});
    moderate.mutate(undefined);
  };
  const fe = mergedErrors(error, local);
  return (
    <Modal
      open
      onClose={() => !moderate.isPending && onClose()}
      title={hide ? "Hide Review" : "Publish Review"}
      size="lg"
      footer={
        <>
          <Button className="flex-1" variant={hide ? "danger" : "success"} onClick={submit} loading={moderate.isPending}>
            {hide ? "Hide Review" : "Publish Review"}
          </Button>
          <Button variant="muted" onClick={onClose} disabled={moderate.isPending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Stars rating={review.rating} />
            <span className="text-sm text-gray-600">
              {review.customer.name} · {review.product.name}
            </span>
          </div>
          {review.title && <p className="font-medium text-gray-900">{review.title}</p>}
          {review.body && <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-6">{review.body}</p>}
        </div>
        <p className="text-sm text-gray-600">
          {hide
            ? "The review disappears from the store and no longer counts in the product's and seller's rating."
            : "The review appears on the product page and counts in the product's and seller's rating."}
        </p>
        <Field label={hide ? "Reason" : "Note (optional)"} required={hide} htmlFor="rv-note" error={fe.note}>
          <Textarea id="rv-note" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder={hide ? "e.g. Contains personal information" : ""} />
        </Field>
        <FormAlert error={error} shown={["note"]} />
      </div>
    </Modal>
  );
}
