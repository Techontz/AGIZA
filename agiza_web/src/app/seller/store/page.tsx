"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { STORE_KEY } from "@/components/seller/application-form";
import { useStore } from "@/components/seller/seller-gate";
import { StoreAvatar } from "@/components/store/store-avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, Notice, Skeleton } from "@/components/ui/states";
import { ApiError, errorMessage } from "@/lib/api/client";
import { sellerApi, shopApi } from "@/lib/api/endpoints";
import type { SellerStore } from "@/lib/api/types";

export default function StoreSettings() {
  const store = useStore();
  if (!store.data) return <Skeleton className="h-96" />;
  return <Settings store={store.data} />;
}

function Settings({ store }: { store: SellerStore }) {
  const client = useQueryClient();
  const cities = useQuery({ queryKey: ["cities"], queryFn: shopApi.cities, staleTime: 3_600_000 });
  const [form, setForm] = useState({
    description: store.description,
    city: String(store.city ?? ""),
    business_address: store.business_address,
    contact_person: store.contact_person,
    phone: store.phone,
    email: store.email,
    payout_method: store.payout_method || "mobile_money",
    payout_provider: store.payout_provider,
    payout_account_name: store.payout_account_name,
    payout_account_number: store.payout_account_number,
  });
  const suspended = store.approval_status === "suspended";
  const save = useMutation({
    mutationFn: () => sellerApi.updateStore({ ...form, city: Number(form.city), payout_method: form.payout_method as "mobile_money" | "bank" }),
    onSuccess: (s) => {
      client.setQueryData(STORE_KEY, s);
      toast.success("Store updated");
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Store settings</h1>
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Logo and banner</h2>
        <div className="flex flex-wrap items-center gap-6">
          <MediaPicker kind="logo" store={store} disabled={suspended}>
            <StoreAvatar seller={{ name: store.name, logo: null, is_agiza: false }} size={80} />
          </MediaPicker>
          <MediaPicker kind="banner" store={store} disabled={suspended} wide />
        </div>
        <p className="mt-3 text-[13px] text-muted">Square logo, wide banner (about 4:1). JPEG, PNG or WebP up to 4 MB.</p>
      </Card>
      <Card>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset disabled={suspended} className="contents">
            <p className="text-[14px] text-muted sm:col-span-2">
              Store name: <span className="font-semibold text-ink">{store.name}</span> — contact AGIZA to change it. Commission: {store.commission}.
            </p>
            <Field label="About your store" htmlFor="s-desc" className="sm:col-span-2">
              <Textarea id="s-desc" maxLength={2000} value={form.description} onChange={set("description")} />
            </Field>
            <Field label="City" htmlFor="s-city" error={err?.field("city")}>
              <Select id="s-city" value={form.city} onChange={set("city")}>
                {cities.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Shop address" htmlFor="s-addr">
              <Input id="s-addr" value={form.business_address} onChange={set("business_address")} />
            </Field>
            <Field label="Contact person" htmlFor="s-contact">
              <Input id="s-contact" value={form.contact_person} onChange={set("contact_person")} />
            </Field>
            <Field label="Business phone" htmlFor="s-phone">
              <Input id="s-phone" value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label="Business email" htmlFor="s-email" error={err?.field("email")} className="sm:col-span-2">
              <Input id="s-email" type="email" value={form.email} onChange={set("email")} />
            </Field>
            <h2 className="mt-2 text-lg font-semibold text-ink sm:col-span-2">Payout account</h2>
            <Field label="Method" htmlFor="s-pm">
              <Select id="s-pm" value={form.payout_method} onChange={set("payout_method")}>
                <option value="mobile_money">Mobile money</option>
                <option value="bank">Bank transfer</option>
              </Select>
            </Field>
            <Field label={form.payout_method === "bank" ? "Bank" : "Network"} htmlFor="s-prov">
              <Input id="s-prov" value={form.payout_provider} onChange={set("payout_provider")} />
            </Field>
            <Field label="Account name" htmlFor="s-accname">
              <Input id="s-accname" value={form.payout_account_name} onChange={set("payout_account_name")} />
            </Field>
            <Field label={form.payout_method === "bank" ? "Account number" : "Phone number"} htmlFor="s-accno">
              <Input id="s-accno" value={form.payout_account_number} onChange={set("payout_account_number")} />
            </Field>
            {save.isError ? (
              <Notice tone="danger" className="sm:col-span-2">
                {errorMessage(save.error)}
              </Notice>
            ) : null}
            <div className="sm:col-span-2">
              <Button type="submit" loading={save.isPending}>
                Save changes
              </Button>
            </div>
          </fieldset>
        </form>
      </Card>
    </>
  );
}

function MediaPicker({ kind, store, disabled, wide, children }: { kind: "logo" | "banner"; store: SellerStore; disabled?: boolean; wide?: boolean; children?: React.ReactNode }) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => setVersion(Date.now()), [store.logo, store.banner]);
  const upload = useMutation({
    mutationFn: (file: File) => sellerApi.uploadMedia(kind, file),
    onSuccess: (s) => {
      client.setQueryData(STORE_KEY, s);
      setVersion(Date.now());
      toast.success(kind === "logo" ? "Logo updated" : "Banner updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const url = store[kind];
  return (
    <div className="flex items-center gap-3">
      <span className={wide ? "relative h-20 w-64 overflow-hidden rounded-md bg-primary-soft" : "relative size-20 overflow-hidden rounded-full bg-primary-soft"}>
        {url ? <Image src={`${url}?v=${version}`} alt="" fill unoptimized className="object-cover" /> : children}
      </span>
      <Button variant="secondary" size="sm" icon={<ImagePlus className="size-4" />} disabled={disabled} loading={upload.isPending} onClick={() => input.current?.click()}>
        {url ? "Change" : "Upload"} {kind}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
