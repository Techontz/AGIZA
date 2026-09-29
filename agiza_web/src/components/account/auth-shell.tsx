import { BadgeCheck, Truck, Wallet } from "lucide-react";

import { Logo } from "../layout/logo";
import { Container } from "../ui/container";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Container className="grid items-start gap-10 py-8 sm:py-12 lg:grid-cols-[1fr_440px] lg:gap-16">
      <div className="hidden pt-6 lg:block">
        <Logo size={36} href={null} />
        <h2 className="mt-6 max-w-md text-[28px] leading-tight font-bold text-ink">One AGIZA account for the website and the app.</h2>
        <ul className="mt-6 space-y-4 text-[15px]">
          <li className="flex gap-3">
            <Truck className="size-5 shrink-0 text-brand" aria-hidden /> Track every order from payment to your door.
          </li>
          <li className="flex gap-3">
            <Wallet className="size-5 shrink-0 text-brand" aria-hidden /> Pay with mobile money or card, or pay on delivery.
          </li>
          <li className="flex gap-3">
            <BadgeCheck className="size-5 shrink-0 text-brand" aria-hidden /> Shop AGIZA and verified stores in a single cart.
          </li>
        </ul>
      </div>
      <div className="rounded-lg bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </Container>
  );
}

/** Only same-site paths are allowed after sign-in (no open redirects). */
export function safeNext(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/api/")) return fallback;
  return value;
}
