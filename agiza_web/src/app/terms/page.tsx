import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/components/service-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" updated="September 2026" draft>
      <p>
        These terms apply when you use the AGIZA website or app. By creating an account or placing an order you agree to them, together
        with the <Link href="/marketplace-terms">marketplace terms</Link>, the <Link href="/returns-policy">return and refund policy</Link>, the{" "}
        <Link href="/delivery-policy">delivery policy</Link> and the <Link href="/privacy">privacy policy</Link>.
      </p>
      <h2>Your account</h2>
      <p>
        You must give accurate details and keep your password private. You are responsible for orders placed with your account. We
        may suspend accounts used for fraud or abuse.
      </p>
      <h2>Orders and prices</h2>
      <p>
        Prices are in Tanzanian shillings. The total, including delivery, is calculated and confirmed at checkout. If a price or stock
        changes before you place the order, we show you the new total first. An order is accepted when AGIZA confirms it.
      </p>
      <h2>Payment and cancellation</h2>
      <p>
        Unpaid orders can be cancelled from your account until AGIZA starts preparing them. Paid orders are cancelled and refunded
        through AGIZA support. If a seller can&apos;t supply part of your order, AGIZA tells you, removes that part from the total and
        refunds any amount you overpaid.
      </p>
      <h2>Reviews</h2>
      <p>
        Only customers who received a product can review it. Reviews must be honest and must not contain personal information, abuse
        or advertising. AGIZA may hide reviews that break these rules.
      </p>
      <h2>Liability</h2>
      <p>
        Nothing in these terms limits your rights under Tanzanian consumer protection law. To the extent the law allows, AGIZA is not
        liable for indirect losses.
      </p>
      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. These terms are governed by the laws of the United Republic
        of Tanzania.
      </p>
    </ProsePage>
  );
}
