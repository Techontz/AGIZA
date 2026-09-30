import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/components/service-page";

export const metadata: Metadata = { title: "Marketplace terms", alternates: { canonical: "/marketplace-terms" } };

export default function MarketplaceTermsPage() {
  return (
    <ProsePage title="Marketplace terms" updated="September 2026" draft>
      <p>AGIZA is a marketplace: products are sold either by AGIZA or by independent stores that AGIZA has approved.</p>
      <h2>Who sells to you</h2>
      <p>
        Every product shows who sells it (&quot;Sold by&quot;). One order can contain products from several sellers. AGIZA takes payment
        for the whole order, collects the items from each seller and delivers them to you together.
      </p>
      <h2>AGIZA&apos;s role</h2>
      <ul>
        <li>AGIZA reviews every store and product before it is listed, and may remove products or suspend stores.</li>
        <li>AGIZA support is your single point of contact for every order, delivery, return and refund, whoever the seller is.</li>
        <li>Refunds are decided and paid by AGIZA, not by the seller.</li>
      </ul>
      <h2>Product information</h2>
      <p>
        Sellers are responsible for describing their products accurately. If a product is not as described, you can ask for a return
        under the <Link href="/returns-policy">return and refund policy</Link>.
      </p>
      <h2>Ratings</h2>
      <p>Product and store ratings are calculated by AGIZA from verified customers&apos; published reviews. Sellers can reply to reviews but cannot edit or remove them.</p>
    </ProsePage>
  );
}
