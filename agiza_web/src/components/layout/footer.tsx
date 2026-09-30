import Link from "next/link";

import type { Category } from "@/lib/api/types";
import { categoryHref } from "@/lib/format";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/site";

import { Container } from "../ui/container";

const COLUMNS = [
  {
    title: "Quick links",
    links: [
      { href: "/terms", label: "Terms of use" },
      { href: "/marketplace-terms", label: "Marketplace terms" },
      { href: "/returns-policy", label: "Return & refund policy" },
      { href: "/delivery-policy", label: "Delivery policy" },
      { href: "/faq", label: "FAQs" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact us" },
      { href: "/sell", label: "Sell on AGIZA" },
      { href: "/vendor-terms", label: "Seller terms" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/cookies", label: "Cookie policy" },
    ],
  },
  {
    title: "Business",
    links: [
      { href: "/shop", label: "Shop" },
      { href: "/stores", label: "Stores" },
      { href: "/buy-for-me", label: "Buy for me" },
      { href: "/deliver-for-me", label: "Deliver for me" },
      { href: "/cart", label: "Cart" },
      { href: "/account", label: "My account" },
      { href: "/account/orders", label: "Track your order" },
    ],
  },
];

/** The footer of agizastore.com: contact + link columns, department links, then copyright and payments. */
export function Footer({ categories = [] }: { categories?: Category[] }) {
  const departments = categories.filter((c) => c.children.length).slice(0, 6);
  return (
    <footer className="mt-16 border-t border-line bg-surface pt-12 max-[1199px]:pb-[60px] lg:pt-[70px]">
      <Container>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 pb-9 lg:grid-cols-[1.6fr_1fr_1fr_0.8fr]">
          <div className="col-span-2 lg:col-span-1">
            <h2 className="text-[16px] font-semibold text-ink">Contact us</h2>
            <div className="mt-6 space-y-1 text-[14px] text-muted">
              {SUPPORT_PHONE ? (
                <>
                  <p>Call us 24/7</p>
                  <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`} className="block py-1 text-[24px] font-semibold text-ink hover:underline">
                    {SUPPORT_PHONE}
                  </a>
                </>
              ) : null}
              <p className="pt-1">Dar es Salaam, Tanzania</p>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="block text-muted hover:text-ink">
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-[16px] font-semibold text-ink">{col.title}</h2>
              <ul className="mt-6 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} prefetch={l.href.startsWith("/account") ? false : undefined} className="text-[14px] text-muted hover:text-ink">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {departments.length ? (
          <nav aria-label="Departments" className="space-y-2.5 border-t border-line py-9 text-[14px]">
            {departments.map((d) => (
              <p key={d.id} className="flex flex-wrap items-baseline gap-x-2 leading-6">
                <Link href={categoryHref(d)} className="mr-1 font-semibold text-ink hover:underline">
                  {d.name}:
                </Link>
                {d.children.map((s, i) => (
                  <span key={s.id} className="text-muted">
                    <Link href={categoryHref(s)} className="hover:text-ink">
                      {s.name}
                    </Link>
                    {i < d.children.length - 1 ? <span className="ml-2" aria-hidden>|</span> : null}
                  </span>
                ))}
              </p>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-line py-8 text-[14px] text-ink sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} AGIZA. All rights reserved.</p>
          <p className="text-muted">
            Prices in TZS · Pay with mobile money or card, or on delivery · Delivery fees are calculated at checkout
          </p>
        </div>
      </Container>
    </footer>
  );
}
