"use client";

import { DollarSign, Plus, RefreshCw, Tag as TagIcon, Trash2, TrendingUp } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { errorText, fieldErrors } from "@/lib/api/errors";
import {
  crmApi,
  crmKeys,
  type CustomerInterest,
  type CustomerProfile,
  type CustomerTagLink,
} from "@/lib/api/services/crm";
import { formatDate } from "@/lib/format";

import { num, SpendBars } from "./shared";

const inputCls =
  "px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-50";

type Pending = { kind: "tag"; item: CustomerTagLink } | { kind: "interest"; item: CustomerInterest } | null;

/** Design: Tags (manual add/remove), Detected Interests (confidence bars), Category Spend Breakdown. */
export function InterestsTab({ profile, canEdit }: { profile: CustomerProfile; canEdit: boolean }) {
  const customerId = profile.customer.id;
  const ids = { tag: useId(), label: useId(), conf: useId() };
  // Refresh the profile, the tag list / campaign chips, and any People list showing tags.
  const invalidate = [crmKeys.all, ["customers"], ["people"]];

  const [tagName, setTagName] = useState("");
  const [tagError, setTagError] = useState("");
  const [label, setLabel] = useState("");
  const [confidence, setConfidence] = useState("50");
  const [interestError, setInterestError] = useState("");
  const [pending, setPending] = useState<Pending>(null);

  const addTag = useApiMutation((name: string) => crmApi.addTag(customerId, name), {
    invalidate,
    success: "Tag added",
    onSuccess: () => {
      setTagName("");
      setTagError("");
    },
    onError: (e) => setTagError(fieldErrors(e).name ?? errorText(e)),
  });

  const addInterest = useApiMutation(
    (data: { label: string; confidence: number }) => crmApi.addInterest(customerId, data),
    {
      invalidate,
      success: "Interest saved",
      onSuccess: () => {
        setLabel("");
        setConfidence("50");
        setInterestError("");
      },
      onError: (e) => {
        const f = fieldErrors(e);
        setInterestError(f.label ?? f.confidence ?? errorText(e));
      },
    },
  );

  const recompute = useApiMutation(() => crmApi.recomputeInterests(customerId), {
    invalidate,
    success: "Interests recalculated from orders",
  });

  const remove = useApiMutation(
    async (p: NonNullable<Pending>): Promise<void> => {
      if (p.kind === "tag") await crmApi.removeTag(customerId, p.item.id);
      else await crmApi.removeInterest(customerId, p.item.id);
    },
    {
      invalidate,
      onSuccess: () => {
        toast.success(pending?.kind === "tag" ? "Tag removed" : "Interest removed");
        setPending(null);
      },
    },
  );

  const submitTag = () => {
    const name = tagName.trim();
    if (!name) {
      setTagError("Enter a tag.");
      return;
    }
    addTag.mutate(name);
  };

  const submitInterest = () => {
    const clean = label.trim();
    const conf = Number(confidence);
    if (!clean) {
      setInterestError("Enter an interest, e.g. electronics.");
      return;
    }
    if (!Number.isInteger(conf) || conf < 1 || conf > 100) {
      setInterestError("Confidence must be a whole number from 1 to 100.");
      return;
    }
    addInterest.mutate({ label: clean, confidence: conf });
  };

  const { tags, interests, category_spend } = profile;
  const totalSpent = num(profile.kpis.total_spent);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Tags */}
      <section aria-labelledby={`${ids.tag}-h`}>
        <div className="flex items-center gap-2 mb-3">
          <TagIcon className="size-4 text-gray-600" />
          <h3 id={`${ids.tag}-h`} className="font-semibold text-gray-900">
            Tags
          </h3>
        </div>
        {canEdit && (
          <div className="mb-3">
            <div className="flex gap-2">
              <label htmlFor={ids.tag} className="sr-only">
                New tag
              </label>
              <input
                id={ids.tag}
                type="text"
                placeholder="Add tag..."
                value={tagName}
                maxLength={60}
                onChange={(e) => {
                  setTagName(e.target.value);
                  if (tagError) setTagError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitTag();
                  }
                }}
                aria-invalid={tagError ? true : undefined}
                className={`flex-1 min-w-0 ${inputCls} ${tagError ? "border-red-400" : ""}`}
              />
              <Button onClick={submitTag} loading={addTag.isPending} className="text-sm gap-1.5">
                {!addTag.isPending && <Plus className="size-4" />}Add
              </Button>
            </div>
            {tagError && (
              <p className="text-xs text-red-600 mt-1" role="alert">
                {tagError}
              </p>
            )}
          </div>
        )}
        <div className="space-y-2">
          {tags.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No tags assigned</p>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      tag.type === "system" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {tag.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {tag.type === "system"
                      ? `System${tag.rule ? ` · rule “${tag.rule}”` : ""}`
                      : "Manual"}{" "}
                    · {formatDate(tag.created_at)}
                  </span>
                </div>
                {tag.type === "manual" && canEdit && (
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "tag", item: tag })}
                    className="p-1 hover:bg-gray-200 rounded shrink-0"
                    aria-label={`Remove tag ${tag.name}`}
                  >
                    <Trash2 className="size-3.5 text-gray-500" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Detected interests */}
      <section aria-labelledby={`${ids.label}-h`}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <TrendingUp className="size-4 text-gray-600" />
          <h3 id={`${ids.label}-h`} className="font-semibold text-gray-900">
            Detected Interests
          </h3>
          <span className="text-xs text-gray-400">(from order history)</span>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-xs"
              loading={recompute.isPending}
              onClick={() => recompute.mutate(undefined)}
            >
              {!recompute.isPending && <RefreshCw className="size-3.5" />}Refresh
            </Button>
          )}
        </div>
        {canEdit && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-2">
              <label htmlFor={ids.label} className="sr-only">
                Interest
              </label>
              <input
                id={ids.label}
                type="text"
                placeholder="Add interest (e.g. electronics)..."
                value={label}
                maxLength={80}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (interestError) setInterestError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitInterest();
                  }
                }}
                className={`flex-1 min-w-40 ${inputCls}`}
              />
              <label htmlFor={ids.conf} className="sr-only">
                Confidence (1–100)
              </label>
              <div className="relative w-24">
                <input
                  id={ids.conf}
                  type="number"
                  min={1}
                  max={100}
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  className={`w-full pr-7 ${inputCls}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
              <Button onClick={submitInterest} loading={addInterest.isPending} className="text-sm gap-1.5">
                {!addInterest.isPending && <Plus className="size-4" />}Add
              </Button>
            </div>
            {interestError && (
              <p className="text-xs text-red-600 mt-1" role="alert">
                {interestError}
              </p>
            )}
          </div>
        )}
        <div className="space-y-2">
          {interests.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No interests detected yet</p>
          ) : (
            interests.map((it) => (
              <div
                key={it.id}
                className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-gray-900 capitalize truncate">{it.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {it.source === "manual" ? "Added by staff" : "Detected"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-indigo-700 font-medium">{it.confidence}% confidence</span>
                    {it.source === "manual" && canEdit && (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: "interest", item: it })}
                        className="p-1 hover:bg-white/60 rounded"
                        aria-label={`Remove interest ${it.label}`}
                      >
                        <Trash2 className="size-3.5 text-gray-500" />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="w-full bg-gray-200 rounded-full h-1.5"
                  role="meter"
                  aria-label={`${it.label} confidence`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={it.confidence}
                >
                  <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${it.confidence}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Category spend breakdown */}
      {category_spend.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="size-4 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Category Spend Breakdown</h3>
          </div>
          <SpendBars rows={category_spend} total={totalSpent} detailed />
        </section>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === "tag" ? "Remove tag" : "Remove interest"}
        message={
          pending && (
            <>
              Remove {pending.kind === "tag" ? "the tag" : "the interest"}{" "}
              <span className="font-semibold">“{pending.kind === "tag" ? pending.item.name : pending.item.label}”</span>{" "}
              from {profile.customer.full_name}? Campaign audiences using it will no longer include this customer.
            </>
          )
        }
        confirmLabel="Remove"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => pending && remove.mutate(pending)}
        onClose={() => !remove.isPending && setPending(null)}
      />
    </div>
  );
}
