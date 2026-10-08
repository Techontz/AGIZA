"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Upload, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/hooks/use-session";
import { ApiError, errorMessage } from "@/lib/api/client";
import { requestApi, shopApi, type RequestInput } from "@/lib/api/endpoints";

import { Button, ButtonLink } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/field";
import { Notice } from "../ui/states";

const MAX_PHOTOS = 5; // the backend's limit per request

/** Buy for me / Deliver for me: becomes a request in AGIZA's Intake & Quotes; AGIZA replies with a quotation. */
export function RequestForm({ type }: { type: RequestInput["request_type"] }) {
  const { signedIn, ready } = useSession();
  const client = useQueryClient();
  const countries = useQuery({
    queryKey: ["sourcing-countries"],
    queryFn: shopApi.sourcingCountries,
    staleTime: 3_600_000,
    enabled: signedIn,
  });
  const cities = useQuery({
    queryKey: ["cities"],
    queryFn: shopApi.cities,
    staleTime: 3_600_000,
    enabled: signedIn,
  });
  const [form, setForm] = useState({
    item_name: "",
    link: "",
    quantity: "1",
    origin_country: "",
    destination_city: "",
    weight_kg: "",
    tracking_number: "",
    details: "",
  });
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const buy = type === "buy_for_me";
  const submit = useMutation({
    mutationFn: async () => {
      // "Buy for me" only asks what the product is; AGIZA works out the rest and replies with a price.
      const quote = await requestApi.create(
        buy
          ? {
              request_type: type,
              item_name: form.item_name,
              quantity: 1,
              details: form.details || undefined,
            }
          : {
              request_type: type,
              item_name: form.item_name,
              link: form.link || undefined,
              quantity: Number(form.quantity) || 1,
              origin_country: form.origin_country,
              destination_city: Number(form.destination_city),
              weight_kg: form.weight_kg || null,
              tracking_number: form.tracking_number || undefined,
              details: form.details || undefined,
            },
      );
      // Photos are optional: the request already exists, so a failed upload doesn't undo it,
      // but the customer is told which photos didn't arrive (instead of losing them silently).
      let photosFailed = 0;
      for (const { file } of photos)
        await requestApi.addPhoto(quote.id, file).catch(() => {
          photosFailed += 1;
        });
      return { ...quote, photosFailed };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["requests"] }),
  });
  const err = submit.error instanceof ApiError ? submit.error : null;
  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!ready)
    return <div className="h-48 animate-pulse rounded-lg bg-canvas" />;
  if (!signedIn) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-muted">
          Sign in to send a request. We&apos;ll reply with a quotation you can
          accept or decline.
        </p>
        <ButtonLink
          href={`/login?next=/${type === "buy_for_me" ? "buy-for-me" : "deliver-for-me"}`}
        >
          Sign in to continue
        </ButtonLink>
      </div>
    );
  }
  if (submit.isSuccess) {
    return (
      <div className="space-y-3 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-6" aria-hidden />
        </span>
        <p className="text-lg font-semibold text-ink">
          Request {submit.data.reference} sent
        </p>
        <p className="text-muted">
          AGIZA will reply with a quotation. You&apos;ll find it under your
          requests.
        </p>
        {submit.data.photosFailed > 0 ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-[14px] text-warning">
            {submit.data.photosFailed === 1
              ? "One photo couldn't be uploaded."
              : `${submit.data.photosFailed} photos couldn't be uploaded.`}{" "}
            Your request was still sent — you can send the photo to AGIZA in chat.
          </p>
        ) : null}
        <Link
          href="/account/requests"
          className="font-semibold text-primary hover:underline"
        >
          View my requests
        </Link>
      </div>
    );
  }
  if (buy) {
    return (
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {submit.isError && !err?.details ? (
          <Notice tone="danger">{errorMessage(submit.error)}</Notice>
        ) : null}
        <Field
          label="Product name *"
          htmlFor="item"
          error={err?.field("item_name")}
        >
          <Input
            id="item"
            required
            maxLength={160}
            value={form.item_name}
            onChange={set("item_name")}
            placeholder="What do you want to order?"
          />
        </Field>
        <Field
          label="Description"
          htmlFor="details"
          error={err?.field("details")}
        >
          <Textarea
            id="details"
            maxLength={2000}
            value={form.details}
            onChange={set("details")}
            placeholder="Add product specifications, links, colors, or quantity."
          />
        </Field>
        <div className="grid gap-2">
          <span className="text-sm font-medium text-ink">
            Upload product photo (optional)
          </span>
          {photos.length ? (
            <ul className="flex flex-wrap gap-2">
              {photos.map(({ file, preview }, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="relative size-20 overflow-hidden rounded-md border border-border bg-canvas"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image */}
                  <img
                    src={preview}
                    alt={file.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setPhotos((all) => all.filter((_, j) => j !== i))
                    }
                    className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {photos.length < MAX_PHOTOS ? (
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center hover:border-primary">
              <Upload className="size-6 text-muted" aria-hidden />
              <span className="font-semibold text-ink">
                {photos.length
                  ? "Add more photos"
                  : "Click to upload or choose from gallery"}
              </span>
              <span className="text-sm text-muted">
                JPG or PNG, up to {MAX_PHOTOS} photos
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setPhotos((all) =>
                    [
                      ...all,
                      ...picked.map((file) => ({
                        file,
                        preview: URL.createObjectURL(file),
                      })),
                    ].slice(0, MAX_PHOTOS),
                  );
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
        <Button type="submit" size="lg" loading={submit.isPending}>
          Place Order
        </Button>
        <p className="text-sm text-muted">
          AGIZA replies with the price. You only pay after you accept it.
        </p>
      </form>
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
      {submit.isError && !err?.details ? (
        <Notice tone="danger" className="sm:col-span-2">
          {errorMessage(submit.error)}
        </Notice>
      ) : null}
      <Field
        label="What are we delivering?"
        htmlFor="item"
        error={err?.field("item_name")}
        className="sm:col-span-2"
      >
        <Input
          id="item"
          required
          maxLength={160}
          value={form.item_name}
          onChange={set("item_name")}
          placeholder="e.g. 2 cartons of shoes"
        />
      </Field>
      <Field
        label="Supplier's tracking number"
        htmlFor="tracking"
        error={err?.field("tracking_number")}
        className="sm:col-span-2"
      >
        <Input
          id="tracking"
          required
          value={form.tracking_number}
          onChange={set("tracking_number")}
        />
      </Field>
      <Field label="From" htmlFor="origin" error={err?.field("origin_country")}>
        <Select
          id="origin"
          required
          value={form.origin_country}
          onChange={set("origin_country")}
        >
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
      <Field
        label="Deliver to"
        htmlFor="dest"
        error={err?.field("destination_city")}
      >
        <Select
          id="dest"
          required
          value={form.destination_city}
          onChange={set("destination_city")}
        >
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
        <Input
          id="qty"
          type="number"
          min={1}
          value={form.quantity}
          onChange={set("quantity")}
        />
      </Field>
      <Field
        label="Approx. weight in kg (optional)"
        htmlFor="weight"
        error={err?.field("weight_kg")}
      >
        <Input
          id="weight"
          inputMode="decimal"
          value={form.weight_kg}
          onChange={set("weight_kg")}
        />
      </Field>
      <Field
        label="Anything else? (optional)"
        htmlFor="details"
        className="sm:col-span-2"
      >
        <Textarea
          id="details"
          maxLength={2000}
          value={form.details}
          onChange={set("details")}
          placeholder="Colour, size, model, deadline…"
        />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" loading={submit.isPending}>
          Send request
        </Button>
      </div>
    </form>
  );
}
