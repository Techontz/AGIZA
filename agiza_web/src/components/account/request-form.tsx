"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/hooks/use-session";
import { ApiError, errorMessage } from "@/lib/api/client";
import { requestApi, shopApi, type RequestInput } from "@/lib/api/endpoints";

import { Button, ButtonLink } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/field";
import { Notice } from "../ui/states";

/** Buy for me / Deliver for me: becomes a request in AGIZA's Intake & Quotes; AGIZA replies with a quotation. */
export function RequestForm({ type }: { type: RequestInput["request_type"] }) {
  const { signedIn, ready } = useSession();
  const client = useQueryClient();
  const countries = useQuery({ queryKey: ["sourcing-countries"], queryFn: shopApi.sourcingCountries, staleTime: 3_600_000, enabled: signedIn });
  const cities = useQuery({ queryKey: ["cities"], queryFn: shopApi.cities, staleTime: 3_600_000, enabled: signedIn });
  const [form, setForm] = useState({ item_name: "", link: "", quantity: "1", origin_country: "", destination_city: "", weight_kg: "", tracking_number: "", details: "" });
  const submit = useMutation({
    mutationFn: () =>
      requestApi.create({
        request_type: type,
        item_name: form.item_name,
        link: form.link || undefined,
        quantity: Number(form.quantity) || 1,
        origin_country: form.origin_country,
        destination_city: Number(form.destination_city),
        weight_kg: form.weight_kg || null,
        tracking_number: form.tracking_number || undefined,
        details: form.details || undefined,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["requests"] }),
  });
  const err = submit.error instanceof ApiError ? submit.error : null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!ready) return <div className="h-48 animate-pulse rounded-lg bg-canvas" />;
  if (!signedIn) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-muted">Sign in to send a request. We&apos;ll reply with a quotation you can accept or decline.</p>
        <ButtonLink href={`/login?next=/${type === "buy_for_me" ? "buy-for-me" : "deliver-for-me"}`}>Sign in to continue</ButtonLink>
      </div>
    );
  }
  if (submit.isSuccess) {
    return (
      <div className="space-y-3 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-6" aria-hidden />
        </span>
        <p className="text-lg font-semibold text-ink">Request {submit.data.reference} sent</p>
        <p className="text-muted">AGIZA will reply with a quotation. You&apos;ll find it under your requests.</p>
        <Link href="/account/requests" className="font-semibold text-primary hover:underline">
          View my requests
        </Link>
      </div>
    );
  }
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      {submit.isError && !err?.details ? <Notice tone="danger" className="sm:col-span-2">{errorMessage(submit.error)}</Notice> : null}
      <Field label={type === "buy_for_me" ? "What should we buy?" : "What are we delivering?"} htmlFor="item" error={err?.field("item_name")} className="sm:col-span-2">
        <Input id="item" required maxLength={160} value={form.item_name} onChange={set("item_name")} placeholder={type === "buy_for_me" ? "e.g. Anker 20,000mAh power bank" : "e.g. 2 cartons of shoes"} />
      </Field>
      {type === "buy_for_me" ? (
        <Field label="Product link (optional)" htmlFor="link" error={err?.field("link")} className="sm:col-span-2">
          <Input id="link" type="url" value={form.link} onChange={set("link")} placeholder="https://…" />
        </Field>
      ) : (
        <Field label="Supplier's tracking number" htmlFor="tracking" error={err?.field("tracking_number")} className="sm:col-span-2">
          <Input id="tracking" required value={form.tracking_number} onChange={set("tracking_number")} />
        </Field>
      )}
      <Field label="From" htmlFor="origin" error={err?.field("origin_country")}>
        <Select id="origin" required value={form.origin_country} onChange={set("origin_country")}>
          <option value="" disabled>
            Choose a country
          </option>
          {countries.data?.map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Deliver to" htmlFor="dest" error={err?.field("destination_city")}>
        <Select id="dest" required value={form.destination_city} onChange={set("destination_city")}>
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
      <Field label="Quantity" htmlFor="qty" error={err?.field("quantity")}>
        <Input id="qty" type="number" min={1} value={form.quantity} onChange={set("quantity")} />
      </Field>
      <Field label="Approx. weight in kg (optional)" htmlFor="weight" error={err?.field("weight_kg")}>
        <Input id="weight" inputMode="decimal" value={form.weight_kg} onChange={set("weight_kg")} />
      </Field>
      <Field label="Anything else? (optional)" htmlFor="details" className="sm:col-span-2">
        <Textarea id="details" maxLength={2000} value={form.details} onChange={set("details")} placeholder="Colour, size, model, deadline…" />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" loading={submit.isPending}>
          Send request
        </Button>
      </div>
    </form>
  );
}
