import { Mail, Phone } from "lucide-react";
import Link from "next/link";

import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/site";

import { Container } from "../ui/container";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "All products" },
      { href: "/stores", label: "Stores" },
      { href: "/shop?sort=newest", label: "New arrivals" },
      { href: "/shop?deals=1", label: "Ofa kali deals" },
    ],
  },
  {
    title: "Services",
    links: [
      { href: "/buy-for-me", label: "Buy for me" },
      { href: "/deliver-for-me", label: "Deliver for me" },
      { href: "/account/orders", label: "Track an order" },
      { href: "/sell", label: "Sell on AGIZA" },
    ],
  },
  {
    title: "AGIZA",
    links: [
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact" },
      { href: "/faq", label: "FAQ" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo size={28} />
          <p className="max-w-xs text-[14px] text-muted">
            Shop from AGIZA and trusted Tanzanian stores. We deliver across Tanzania and bring goods in from China, Dubai, the
            USA, the UK and India.
          </p>
          <div className="space-y-2 text-[14px]">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 text-ink hover:text-primary">
              <Mail className="size-4 text-brand" aria-hidden /> {SUPPORT_EMAIL}
            </a>
            {SUPPORT_PHONE ? (
              <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`} className="flex items-center gap-2 text-ink hover:text-primary">
                <Phone className="size-4 text-brand" aria-hidden /> {SUPPORT_PHONE}
              </a>
            ) : null}
          </div>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={l.href.startsWith("/account") ? false : undefined} className="text-[14px] text-muted hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-col gap-2 py-5 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} AGIZA. All rights reserved.</p>
          <p>Prices in Tanzanian shillings (TZS). Delivery fees are calculated at checkout.</p>
        </Container>
      </div>
    </footer>
  );
}
