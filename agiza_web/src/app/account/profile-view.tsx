"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, Notice, Skeleton } from "@/components/ui/states";
import { SESSION_KEY, useSession } from "@/hooks/use-session";
import { ApiError, errorMessage } from "@/lib/api/client";
import { sessionApi } from "@/lib/api/endpoints";
import { date } from "@/lib/format";

export function ProfileView() {
  const { customer, isLoading } = useSession();
  const client = useQueryClient();
  const [form, setForm] = useState({ full_name: "", email: "", company_name: "" });
  const [pw, setPw] = useState({ current: "", next: "" });
  useEffect(() => {
    if (customer) setForm({ full_name: customer.full_name, email: customer.email, company_name: customer.company_name });
  }, [customer]);
  const save = useMutation({
    mutationFn: () => sessionApi.updateMe(form),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: SESSION_KEY });
      toast.success("Profile saved");
    },
  });
  const change = useMutation({
    mutationFn: () => sessionApi.changePassword(pw.current, pw.next),
    onSuccess: () => {
      setPw({ current: "", next: "" });
      toast.success("Password changed. Other devices were signed out.");
    },
  });
  if (isLoading || !customer) return <Skeleton className="h-80" />;
  const err = save.error instanceof ApiError ? save.error : null;
  const pwErr = change.error instanceof ApiError ? change.error : null;
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-medium text-ink">Profile</h1>
      <Card>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Full name" htmlFor="name" error={err?.field("full_name")}>
            <Input id="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </Field>
          <Field label="Phone" htmlFor="phone" hint="Your sign-in number can't be changed here.">
            <Input id="phone" value={customer.phone} disabled />
          </Field>
          <Field label="Email" htmlFor="email" error={err?.field("email")}>
            <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Company (optional)" htmlFor="company">
            <Input id="company" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </Field>
          {save.isError && !err?.field("full_name") && !err?.field("email") ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="text-[13px] text-muted">
              Customer {customer.reference} · since {date(customer.created_at)}
            </p>
            <Button type="submit" loading={save.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Change password</h2>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            change.mutate();
          }}
        >
          <Field label="Current password" htmlFor="pw-current" error={pwErr?.field("current_password")}>
            <Input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </Field>
          <Field label="New password" htmlFor="pw-new" error={pwErr?.field("new_password")}>
            <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </Field>
          {change.isError && !pwErr?.field("current_password") && !pwErr?.field("new_password") ? (
            <Notice tone="danger">{errorMessage(change.error)}</Notice>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" loading={change.isPending}>
              Update password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
