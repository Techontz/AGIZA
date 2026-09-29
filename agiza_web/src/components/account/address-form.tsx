"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, errorMessage } from "@/lib/api/client";
import { addressApi, shopApi, type AddressInput } from "@/lib/api/endpoints";
import type { Address } from "@/lib/api/types";

import { Button } from "../ui/button";
import { Field, Input, Select } from "../ui/field";
import { Notice } from "../ui/states";

export const ADDRESSES_KEY = ["addresses"] as const;

export function AddressForm({ address, onDone, onCancel }: { address?: Address; onDone: (a: Address) => void; onCancel?: () => void }) {
  const client = useQueryClient();
  const cities = useQuery({ queryKey: ["cities"], queryFn: shopApi.cities, staleTime: 3_600_000 });
  const [form, setForm] = useState<AddressInput>({
    label: address?.label ?? "Home",
    line1: address?.line1 ?? "",
    area: address?.area ?? "",
    city: address?.city ?? 0,
    is_default: address?.is_default ?? false,
  });
  const save = useMutation({
    mutationFn: () => (address ? addressApi.update(address.id, form) : addressApi.create(form)),
    onSuccess: (a) => {
      client.invalidateQueries({ queryKey: ADDRESSES_KEY });
      onDone(a);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {save.isError && !err?.field("line1") && !err?.field("city") ? (
        <Notice tone="danger" className="sm:col-span-2">
          {errorMessage(save.error)}
        </Notice>
      ) : null}
      <Field label="Label" htmlFor="addr-label" hint="e.g. Home, Office">
        <Input id="addr-label" value={form.label} maxLength={60} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      </Field>
      <Field label="City" htmlFor="addr-city" error={err?.field("city")}>
        <Select id="addr-city" required value={form.city || ""} onChange={(e) => setForm({ ...form, city: Number(e.target.value) })}>
          <option value="" disabled>
            {cities.isLoading ? "Loading cities…" : "Choose a city"}
          </option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.region && c.region !== c.name ? ` (${c.region})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Street, building or landmark" htmlFor="addr-line1" error={err?.field("line1")} className="sm:col-span-2">
        <Input id="addr-line1" required value={form.line1} maxLength={255} onChange={(e) => setForm({ ...form, line1: e.target.value })} placeholder="Plot 12, Mikocheni B, near the mosque" />
      </Field>
      <Field label="Area / neighbourhood" htmlFor="addr-area">
        <Input id="addr-area" value={form.area} maxLength={120} onChange={(e) => setForm({ ...form, area: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-3 text-[14px] text-ink">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
        Use as my default address
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={save.isPending}>
          {address ? "Save address" : "Add address"}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
