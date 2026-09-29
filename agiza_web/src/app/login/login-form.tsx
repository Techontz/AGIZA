"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { safeNext } from "@/components/account/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { ApiError, errorMessage } from "@/lib/api/client";
import { sessionApi } from "@/lib/api/endpoints";

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await sessionApi.login(phone, password);
          // A full load: the router cache may still hold pages fetched while signed out.
          window.location.assign(next);
        } catch (err) {
          setError(err as Error);
          setBusy(false);
        }
      }}
    >
      {error && !(error instanceof ApiError && (error.field("phone") || error.field("password"))) ? (
        <Notice tone="danger">{errorMessage(error)}</Notice>
      ) : null}
      <Field label="Phone number" htmlFor="phone" error={error instanceof ApiError ? error.field("phone") : undefined}>
        <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password" error={error instanceof ApiError ? error.field("password") : undefined}>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-[14px] font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Sign in
      </Button>
      <p className="text-center text-[14px] text-muted">
        New to AGIZA?{" "}
        <Link href={`/register${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
