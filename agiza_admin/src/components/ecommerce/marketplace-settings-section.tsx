"use client";

import { useQuery } from "@tanstack/react-query";
import { Edit, Lock, Percent, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { TBody, THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { ApiError } from "@/lib/api/client";
import { errorText, fieldErrors } from "@/lib/api/errors";
import { catalogApi, catalogKeys } from "@/lib/api/services/catalog";
import {
  marketplaceApi,
  marketplaceKeys,
  type CategoryCommission,
  type MarketplaceSettings,
  type MarketplaceSettingsInput,
} from "@/lib/api/services/marketplace";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/format";

import { FormErrors, IconSwitch, useCatalogAccess, type Errors } from "./shared";

const MANAGE_ONLY = "Marketplace settings can only be changed by users with Manage access to the E-commerce module.";

/** Marketplace writes: 400 → form fields, 403 → a clear permission message, else a toast. */
function useMarketplaceMutation<V, R>(
  fn: (v: V) => Promise<R>,
  opts: { success: string | ((r: R) => string); onSuccess?: (r: R) => void; setErrors?: (e: Errors) => void },
) {
  return useApiMutation(fn, {
    invalidate: [marketplaceKeys.all],
    success: opts.success,
    onSuccess: opts.onSuccess,
    onError: (err) => {
      const fe = fieldErrors(err);
      if (err instanceof ApiError && err.status === 403) toast.error(MANAGE_ONLY);
      else if (opts.setErrors && err instanceof ApiError && err.status === 400 && Object.keys(fe).length) opts.setErrors(fe);
      else toast.error(errorText(err));
    },
  });
}

function percentError(v: string): string | null {
  if (v.trim() === "") return "Enter a percentage.";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return "Enter a percentage between 0 and 100.";
  return null;
}

/** Marketplace Settings: commission, product review, vendor applications, payout schedule and category rates. */
export function MarketplaceSettingsSection() {
  const { canManage } = useCatalogAccess();
  const settings = useQuery({ queryKey: marketplaceKeys.settings, queryFn: ({ signal }) => marketplaceApi.settings.get(signal) });

  return (
    <div className="space-y-6">
      {!canManage && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
          <Lock className="size-4 flex-shrink-0" />
          {MANAGE_ONLY}
        </div>
      )}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Marketplace Settings</h2>
            <p className="text-sm text-gray-600 mt-1">How vendors join, how their products are reviewed, and AGIZA&apos;s default commission.</p>
          </div>
          {settings.data && <p className="text-xs text-gray-500">Last saved {formatDateTime(settings.data.updated_at)}</p>}
        </div>
        {settings.isError && !settings.data ? (
          <ErrorState bare message={errorText(settings.error)} onRetry={() => settings.refetch()} />
        ) : settings.data ? (
          <SettingsForm key={settings.data.updated_at} data={settings.data} canManage={canManage} />
        ) : (
          <div className="space-y-6 max-w-2xl">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <CategoryCommissions canManage={canManage} defaultPercent={settings.data?.default_commission_percent} />
    </div>
  );
}

const SETTINGS_FIELDS = ["default_commission_percent", "require_product_review", "vendor_applications_open", "payout_schedule"] as const;

function SettingsForm({ data, canManage }: { data: MarketplaceSettings; canManage: boolean }) {
  const [form, setForm] = useState({
    default_commission_percent: String(Number(data.default_commission_percent)),
    require_product_review: data.require_product_review,
    vendor_applications_open: data.vendor_applications_open,
    payout_schedule: data.payout_schedule,
  });
  const [errors, setErrors] = useState<Errors>({});
  const save = useMarketplaceMutation((body: MarketplaceSettingsInput) => marketplaceApi.settings.update(body), {
    success: "Marketplace settings saved",
    setErrors,
  });
  const ro = !canManage;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const pe = percentError(form.default_commission_percent);
    if (pe) return setErrors({ default_commission_percent: pe });
    setErrors({});
    save.mutate({ ...form, payout_schedule: form.payout_schedule.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl" noValidate>
      <FormErrors errors={errors} fields={SETTINGS_FIELDS} />
      <Field
        label="Default commission"
        htmlFor="mp-commission"
        error={errors.default_commission_percent}
        hint="AGIZA's share of a vendor sale when no vendor agreement or category rate applies."
      >
        <div className="relative max-w-xs">
          <input
            id="mp-commission"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.01"
            value={form.default_commission_percent}
            disabled={ro}
            onChange={(e) => setForm({ ...form, default_commission_percent: e.target.value })}
            aria-invalid={Boolean(errors.default_commission_percent) || undefined}
            className={cn(inputClass, "pr-10", errors.default_commission_percent && "border-red-400 focus:ring-red-500")}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">%</span>
        </div>
      </Field>
      <Field label="Payout schedule" htmlFor="mp-schedule" error={errors.payout_schedule} hint="Shown to vendors in the seller app, e.g. “Every Friday for orders delivered and paid by Wednesday”.">
        <Textarea id="mp-schedule" rows={2} value={form.payout_schedule} disabled={ro} onChange={(e) => setForm({ ...form, payout_schedule: e.target.value })} />
      </Field>

      <div>
        <div className="flex items-center justify-between gap-4 py-3 border-t border-gray-200">
          <div>
            <p className="font-semibold text-gray-900">Review vendor products</p>
            <p className="text-sm text-gray-600">New self-service products, and changes to their name, description, category, brand or images, wait for approval</p>
          </div>
          <IconSwitch size="lg" checked={form.require_product_review} onChange={(v) => setForm({ ...form, require_product_review: v })} disabled={ro} label="Review vendor products" />
        </div>
        <div className="flex items-center justify-between gap-4 py-3 border-y border-gray-200">
          <div>
            <p className="font-semibold text-gray-900">Accept vendor applications</p>
            <p className="text-sm text-gray-600">Customers can apply to open a store from the app and the website</p>
          </div>
          <IconSwitch size="lg" checked={form.vendor_applications_open} onChange={(v) => setForm({ ...form, vendor_applications_open: v })} disabled={ro} label="Accept vendor applications" />
        </div>
      </div>
      {canManage && (
        <Button type="submit" size="lg" loading={save.isPending}>
          Save Settings
        </Button>
      )}
    </form>
  );
}

/* ------------------------------------------------------ category rates */

function CategoryCommissions({ canManage, defaultPercent }: { canManage: boolean; defaultPercent?: string }) {
  const rates = useQuery({ queryKey: marketplaceKeys.categoryCommissions, queryFn: ({ signal }) => marketplaceApi.categoryCommissions.list(signal) });
  const [editing, setEditing] = useState<CategoryCommission | "new" | null>(null);
  const [deleting, setDeleting] = useState<CategoryCommission | null>(null);
  const remove = useMarketplaceMutation((r: CategoryCommission) => marketplaceApi.categoryCommissions.remove(r.id), {
    success: "Category rate removed",
    onSuccess: () => setDeleting(null),
  });

  return (
    <Card className="overflow-hidden">
      <div className="p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Category Commission Rates</h2>
          <p className="text-sm text-gray-600 mt-1">
            Override the default commission{defaultPercent ? ` (${Number(defaultPercent)}%)` : ""} for a category or subcategory. A subcategory rate wins over its
            category; a vendor&apos;s own agreement wins over both.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing("new")} className="flex-shrink-0">
            + Add Category Rate
          </Button>
        )}
      </div>
      {rates.isError && !rates.data ? (
        <ErrorState bare message={errorText(rates.error)} onRetry={() => rates.refetch()} />
      ) : rates.isPending ? (
        <div className="p-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rates.data.length === 0 ? (
        <div className="p-10 text-center">
          <Percent className="size-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">No category rates. Every vendor sale uses the default commission (or the vendor&apos;s agreement).</p>
        </div>
      ) : (
        <Table>
          <THead>
            <Th>Category</Th>
            <Th>Commission</Th>
            <Th>Updated</Th>
            {canManage && <Th>Actions</Th>}
          </THead>
          <TBody>
            {rates.data.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium text-gray-900">{r.category_name}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm font-semibold">
                    <Percent className="size-4" />
                    {Number(r.percent)}%
                  </span>
                </Td>
                <Td className="text-sm text-gray-600">{formatDate(r.updated_at)}</Td>
                {canManage && (
                  <Td>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setEditing(r)} className="text-blue-600 hover:text-blue-800" aria-label={`Edit rate for ${r.category_name}`} title="Edit">
                        <Edit className="size-5" />
                      </button>
                      <button type="button" onClick={() => setDeleting(r)} className="text-red-600 hover:text-red-800" aria-label={`Remove rate for ${r.category_name}`} title="Remove">
                        <Trash2 className="size-5" />
                      </button>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {editing && <RateModal rate={editing === "new" ? null : editing} taken={(rates.data ?? []).map((r) => r.category)} onClose={() => setEditing(null)} />}
      <Modal
        open={Boolean(deleting)}
        onClose={() => !remove.isPending && setDeleting(null)}
        title="Remove Category Rate"
        size="md"
        footer={
          <>
            <Button variant="danger" className="flex-1" loading={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              Remove
            </Button>
            <Button variant="muted" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
          </>
        }
      >
        <p className="text-gray-700">
          Remove the {deleting && Number(deleting.percent)}% rate for <span className="font-semibold">“{deleting?.category_name}”</span>? Its products fall back to the parent
          category rate or the default commission. Orders already placed keep the rate they were placed with.
        </p>
      </Modal>
    </Card>
  );
}

function RateModal({ rate, taken, onClose }: { rate: CategoryCommission | null; taken: number[]; onClose: () => void }) {
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: ({ signal }) => catalogApi.categories.list(signal) });
  const [category, setCategory] = useState(rate ? String(rate.category) : "");
  const [percent, setPercent] = useState(rate ? String(Number(rate.percent)) : "");
  const [errors, setErrors] = useState<Errors>({});
  const save = useMarketplaceMutation(
    (body: { category: number; percent: string }) =>
      rate ? marketplaceApi.categoryCommissions.update(rate.id, body) : marketplaceApi.categoryCommissions.create(body),
    { success: (r) => `Commission for ${r.category_name} set to ${Number(r.percent)}%`, onSuccess: onClose, setErrors },
  );

  const all = categories.data ?? [];
  const top = all.filter((c) => c.parent === null);
  const available = (id: number) => !taken.includes(id) || String(id) === category;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (!category) local.category = "Choose a category.";
    const pe = percentError(percent);
    if (pe) local.percent = pe;
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate({ category: Number(category), percent });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={rate ? "Edit Category Rate" : "Add Category Rate"}
      size="lg"
      footer={
        <>
          <Button type="submit" form="rate-form" className="flex-1" size="lg" loading={save.isPending}>
            {rate ? "Update Rate" : "Add Rate"}
          </Button>
          <Button variant="muted" size="lg" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <form id="rate-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormErrors errors={errors} fields={["category", "percent"]} />
        <Field label="Category" required htmlFor="rate-category" error={errors.category}>
          <Select id="rate-category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={Boolean(rate)}>
            <option value="">{categories.isPending ? "Loading categories…" : "Select a category"}</option>
            {top.map((c) => {
              const subs = all.filter((s) => s.parent === c.id);
              return [
                <option key={c.id} value={c.id} disabled={!available(c.id)}>
                  {c.name}
                  {!available(c.id) ? " (has a rate)" : ""}
                </option>,
                ...subs.map((s) => (
                  <option key={s.id} value={s.id} disabled={!available(s.id)}>
                    {"   "}
                    {s.name}
                    {!available(s.id) ? " (has a rate)" : ""}
                  </option>
                )),
              ];
            })}
          </Select>
        </Field>
        <Field label="Commission" required htmlFor="rate-percent" error={errors.percent}>
          <div className="relative max-w-xs">
            <Input
              id="rate-percent"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              invalid={Boolean(errors.percent)}
              className="pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">%</span>
          </div>
        </Field>
      </form>
    </Modal>
  );
}
