import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/account/auth-shell";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthShell title="Create your AGIZA account" subtitle="Shop, check out and track orders. Works in the AGIZA app too.">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
