import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/account/auth-shell";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <AuthShell title="Sign in" subtitle="Use the phone number and password of your AGIZA account.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
