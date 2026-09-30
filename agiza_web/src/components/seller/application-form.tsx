"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { SESSION_KEY } from "@/hooks/use-session";
import { ApiError, errorMessage } from "@/lib/api/client";
import { sellerApi, shopApi, type ApplicationInput } from "@/lib/api/endpoints";
import type { SellerStore } from "@/lib/api/types";

import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/field";
import { Notice } from "../ui/states";

export const STORE_KEY = ["seller", "store"] as const;

/** Applying to sell, or correcting a pending application. Staff review it in the AGIZA admin. */
export function ApplicationForm({ store, onDone }: { store?: SellerStore | null; onDone: (s: SellerStore) => void }) {
  const client = useQueryClient();
  const cities = useQuery({ queryKey: ["cities"], queryFn: shopApi.cities, staleTime: 3_600_000 });
  const [form, setForm] = useState({
    name: store?.name ?? "",
    description: store?.description ?? "",
    city: store?.city ? String(store.city) : "",
    business_address: store?.business_address ?? "",
    contact_person: store?.contact_person ?? "",
    phone: store?.phone ?? "",
    email: store?.email ?? "",
    business_type: store?.business_type || "individual",
    legal_name: store?.legal_name ?? "",
    registration_number: store?.registration_number ?? "",
    tin: store?.tin ?? "",
    payout_method: store?.payout_method || "mobile_money",
    payout_provider: store?.payout_provider ?? "",
    payout_account_name: store?.payout_account_name ?? "",
    payout_account_number: store?.payout_account_number ?? "",
  });
  const save = useMutation({
    mutationFn: () => {
      const data: ApplicationInput = { ...form, city: Number(form.city), business_type: form.business_type as "individual" | "company", payout_method: form.payout_method as "mobile_money" | "bank" };
      return store ? sellerApi.updateStore(data) : sellerApi.apply(data);
    },
    onSuccess: (s) => {
      client.setQueryData(STORE_KEY, s);
      client.invalidateQueries({ queryKey: SESSION_KEY });
      onDone(s);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const f = (name: string) => err?.field(name);

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {save.isError && !(err?.details && Object.keys(err.details as object).length) ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      {err?.details ? <Notice tone="danger">Please correct the highlighted fields.</Notice> : null}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold text-ink">Your store</legend>
        <Field label="Store name" htmlFor="name" error={f("name")} hint="Shown to customers." className="sm:col-span-2">
          <Input id="name" required minLength={3} maxLength={150} value={form.name} onChange={set("name")} />
        </Field>
        <Field label="What do you sell?" htmlFor="description" error={f("description")} className="sm:col-span-2">
          <Textarea id="description" maxLength={2000} value={form.description} onChange={set("description")} placeholder="Phones and accessories, original and with warranty…" />
        </Field>
        <Field label="City" htmlFor="city" error={f("city")} hint="Where AGIZA collects your orders.">
          <Select id="city" required value={form.city} onChange={set("city")}>
            <option value="" disabled>
              Choose a city
            </option>
            {cities.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Shop address" htmlFor="address" error={f("business_address")}>
          <Input id="address" required maxLength={255} value={form.business_address} onChange={set("business_address")} placeholder="Street, building, landmark" />
        </Field>
        <Field label="Contact person" htmlFor="contact" error={f("contact_person")}>
          <Input id="contact" required maxLength={150} value={form.contact_person} onChange={set("contact_person")} />
        </Field>
        <Field label="Business phone" htmlFor="phone" error={f("phone")}>
          <Input id="phone" type="tel" required maxLength={32} value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Business email (optional)" htmlFor="email" error={f("email")} className="sm:col-span-2">
          <Input id="email" type="email" value={form.email} onChange={set("email")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-lg font-semibold text-ink">Business details</legend>
        <p className="text-[14px] text-muted sm:col-span-2">AGIZA uses these to verify your business. They are never shown to customers.</p>
        <Field label="Business type" htmlFor="btype" error={f("business_type")}>
          <Select id="btype" value={form.business_type} onChange={set("business_type")}>
            <option value="individual">Individual / sole trader</option>
            <option value="company">Registered company</option>
          </Select>
        </Field>
        <Field label="Registered name (optional)" htmlFor="legal" error={f("legal_name")}>
          <Input id="legal" maxLength={200} value={form.legal_name} onChange={set("legal_name")} />
        </Field>
        <Field label="Registration no. (optional)" htmlFor="reg" error={f("registration_number")}>
          <Input id="reg" maxLength={60} value={form.registration_number} onChange={set("registration_number")} />
        </Field>
        <Field label="TIN (optional)" htmlFor="tin" error={f("tin")}>
          <Input id="tin" maxLength={30} value={form.tin} onChange={set("tin")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-lg font-semibold text-ink">Where we pay you</legend>
        <p className="text-[14px] text-muted sm:col-span-2">AGIZA settles your earnings for delivered and paid orders to this account.</p>
        <Field label="Method" htmlFor="pm" error={f("payout_method")}>
          <Select id="pm" value={form.payout_method} onChange={set("payout_method")}>
            <option value="mobile_money">Mobile money</option>
            <option value="bank">Bank transfer</option>
          </Select>
        </Field>
        <Field label={form.payout_method === "bank" ? "Bank" : "Network"} htmlFor="provider" error={f("payout_provider")}>
          <Input id="provider" maxLength={80} value={form.payout_provider} onChange={set("payout_provider")} placeholder={form.payout_method === "bank" ? "e.g. CRDB" : "e.g. M-Pesa"} />
        </Field>
        <Field label="Account name" htmlFor="accname" error={f("payout_account_name")}>
          <Input id="accname" maxLength={150} value={form.payout_account_name} onChange={set("payout_account_name")} />
        </Field>
        <Field label={form.payout_method === "bank" ? "Account number" : "Phone number"} htmlFor="accno" error={f("payout_account_number")}>
          <Input id="accno" maxLength={60} value={form.payout_account_number} onChange={set("payout_account_number")} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={save.isPending}>
          {store ? "Save and resubmit" : "Submit application"}
        </Button>
        <p className="text-[13px] text-muted">
          AGIZA reviews every application, usually within a few working days. By applying you accept the{" "}
          <Link href="/vendor-terms" className="font-medium text-primary hover:underline">
            seller terms
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
