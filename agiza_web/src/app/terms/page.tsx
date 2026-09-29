import type { Metadata } from "next";

import { ProsePage } from "@/components/service-page";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" updated="September 2026">
      <p>By using the AGIZA website or app you agree to these terms.</p>
      <h2>Orders and prices</h2>
      <p>
        Prices are in Tanzanian shillings. The total, including delivery, is calculated and confirmed by AGIZA at checkout. If a
        price or stock changes before you place the order, we show you the new total first.
      </p>
      <h2>Marketplace sellers</h2>
      <p>
        Products are sold by AGIZA or by the store shown on the product (&quot;Sold by&quot;). AGIZA reviews stores and their
        products, takes payment for the whole order, and delivers it. AGIZA support is your contact for any problem with an order.
      </p>
      <h2>Payment and cancellation</h2>
      <p>Unpaid orders can be cancelled from your account until AGIZA starts preparing them. Paid orders are cancelled and refunded through AGIZA support.</p>
      <h2>Selling on AGIZA</h2>
      <p>
        Sellers apply with their AGIZA account and may sell once approved. AGIZA may review, reject or disable products, and
        suspend stores that break these terms. AGIZA deducts its commission from each sale and settles sellers&apos; earnings for
        delivered and paid orders.
      </p>
    </ProsePage>
  );
}
