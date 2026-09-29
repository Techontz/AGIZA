import { Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/components/service-page";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/site";

export const metadata: Metadata = { title: "Contact AGIZA", description: "Get help with an order, a delivery or selling on AGIZA.", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <ProsePage title="Contact us">
      <p>We&apos;re here to help with orders, deliveries, payments and selling on AGIZA.</p>
      <ul className="!ml-0 space-y-3">
        <li className="flex list-none items-center gap-3">
          <MessageCircle className="size-5 text-brand" aria-hidden />
          <span>
            <Link href="/account/support">Chat with AGIZA Support</Link> from your account (fastest for questions about an order).
          </span>
        </li>
        <li className="flex list-none items-center gap-3">
          <Mail className="size-5 text-brand" aria-hidden />
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </li>
        {SUPPORT_PHONE ? (
          <li className="flex list-none items-center gap-3">
            <Phone className="size-5 text-brand" aria-hidden />
            <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}>{SUPPORT_PHONE}</a>
          </li>
        ) : null}
      </ul>
      <p>
        When writing about an order, include its reference (for example SHP-000123) so we can find it quickly.
      </p>
    </ProsePage>
  );
}
