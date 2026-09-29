import type { Metadata } from "next";

import { AuthShell } from "@/components/account/auth-shell";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll text a code to the phone number on your account.">
      <ResetForm />
    </AuthShell>
  );
}
