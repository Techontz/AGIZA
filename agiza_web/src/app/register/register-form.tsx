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

/** Two steps, as in the app: we text a code to the phone, then the customer sets their details. */
export function RegisterForm() {
  const next = safeNext(useSearchParams().get("next"), "/");
  const [step, setStep] = useState<"phone" | "details">("phone");
  const [form, setForm] = useState({ phone: "", code: "", full_name: "", email: "", password: "" });
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fieldError = (name: string) => (error instanceof ApiError ? error.field(name) : undefined);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await sessionApi.requestCode(form.phone, "register");
      setInfo(res.detail);
      setStep("details");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (step === "phone") return sendCode();
        setBusy(true);
        setError(null);
        try {
          await sessionApi.register({ ...form, email: form.email || undefined });
          window.location.assign(next === "/" ? "/account" : next);
        } catch (err) {
          setError(err);
          setBusy(false);
        }
      }}
    >
      {error && !["phone", "code", "full_name", "email", "password"].some(fieldError) ? <Notice tone="danger">{errorMessage(error)}</Notice> : null}
      <Field label="Phone number" htmlFor="phone" error={fieldError("phone")} hint={step === "phone" ? "We'll text you a 6-digit code to confirm it's yours." : undefined}>
        <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={set("phone")} readOnly={step === "details"} required />
      </Field>
      {step === "details" ? (
        <>
          {info ? <Notice tone="success">{info}</Notice> : null}
          <Field label="Verification code" htmlFor="code" error={fieldError("code")}>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={set("code")} required />
          </Field>
          <Field label="Full name" htmlFor="full_name" error={fieldError("full_name")}>
            <Input id="full_name" autoComplete="name" value={form.full_name} onChange={set("full_name")} required />
          </Field>
          <Field label="Email (optional)" htmlFor="email" error={fieldError("email")}>
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldError("password")} hint="At least 8 characters.">
            <Input id="password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} required />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Create account
          </Button>
          <div className="flex justify-between text-[14px]">
            <button type="button" className="font-medium text-muted hover:text-ink" onClick={() => setStep("phone")}>
              Change number
            </button>
            <button type="button" className="font-medium text-primary hover:underline" onClick={sendCode} disabled={busy}>
              Resend code
            </button>
          </div>
        </>
      ) : (
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Send code
        </Button>
      )}
      <p className="text-center text-[14px] text-muted">
        Already have an account?{" "}
        <Link href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
