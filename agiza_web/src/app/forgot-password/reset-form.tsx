"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";
import { ApiError, errorMessage } from "@/lib/api/client";
import { sessionApi } from "@/lib/api/endpoints";

export function ResetForm() {
  const [step, setStep] = useState<"phone" | "code" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fieldError = (n: string) => (error instanceof ApiError ? error.field(n) : undefined);

  if (step === "done") {
    return (
      <div className="space-y-4">
        <Notice tone="success">Your password was changed. Sign in with the new one.</Notice>
        <Link href="/login" className="block text-center font-semibold text-primary hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          if (step === "phone") {
            await sessionApi.requestCode(phone, "reset_password");
            setStep("code");
          } else {
            await sessionApi.resetPassword({ phone, code, password });
            setStep("done");
          }
        } catch (err) {
          setError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && !fieldError("phone") && !fieldError("code") && !fieldError("password") ? <Notice tone="danger">{errorMessage(error)}</Notice> : null}
      <Field label="Phone number" htmlFor="phone" error={fieldError("phone")}>
        <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} readOnly={step === "code"} required />
      </Field>
      {step === "code" ? (
        <>
          <Field label="Code from the SMS" htmlFor="code" error={fieldError("code")}>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field label="New password" htmlFor="password" error={fieldError("password")}>
            <Input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        </>
      ) : null}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {step === "phone" ? "Send code" : "Set new password"}
      </Button>
    </form>
  );
}
