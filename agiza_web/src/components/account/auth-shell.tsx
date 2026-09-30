import { BadgeCheck, Truck, Wallet } from "lucide-react";

import { Container } from "../ui/container";

/** Sign-in pages as on agizastore.com: one centred bordered box, with what the account gives you underneath. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Container className="py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[480px]">
        <div className="border border-line bg-surface p-6 sm:p-10">
          <h1 className="text-[24px] font-semibold text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-[14px] text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        <ul className="mt-6 space-y-2.5 px-1 text-[14px] text-muted">
          <li className="flex gap-3">
            <Truck className="size-5 shrink-0 text-ink" aria-hidden /> One AGIZA account for the website and the app.
          </li>
          <li className="flex gap-3">
            <Wallet className="size-5 shrink-0 text-ink" aria-hidden /> Pay with mobile money or card, or pay on delivery.
          </li>
          <li className="flex gap-3">
            <BadgeCheck className="size-5 shrink-0 text-ink" aria-hidden /> Shop AGIZA and verified stores in a single cart.
          </li>
        </ul>
      </div>
    </Container>
  );
}

/** Only same-site paths are allowed after sign-in (no open redirects). */
export function safeNext(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/api/")) return fallback;
  return value;
}
