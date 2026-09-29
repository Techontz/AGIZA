import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/components/service-page";

export const metadata: Metadata = {
  title: "About AGIZA",
  description: "AGIZA is a Tanzanian commerce and logistics platform: a marketplace of verified stores, international sourcing, and delivery across Tanzania.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ProsePage title="About AGIZA">
      <p>
        AGIZA is a Tanzanian commerce and logistics company. We run a marketplace where you can shop from AGIZA and from verified
        Tanzanian stores in one cart, and we bring goods in from China, Dubai, the USA, the UK and India for customers and
        businesses.
      </p>
      <h2>What we do</h2>
      <ul>
        <li>
          <Link href="/shop">The AGIZA marketplace</Link> — products from AGIZA and reviewed sellers, priced in TZS.
        </li>
        <li>
          <Link href="/buy-for-me">Buy for me</Link> — we buy abroad on your behalf and deliver to your door.
        </li>
        <li>
          <Link href="/deliver-for-me">Deliver for me</Link> — we ship and clear goods you have already bought.
        </li>
        <li>Delivery across Tanzania, from rider delivery in the city to trusted partners upcountry.</li>
      </ul>
      <h2>How the marketplace works</h2>
      <p>
        Every store is reviewed by AGIZA before it can sell. When you order, you pay AGIZA once — even for items from several
        stores. AGIZA collects the items from each store and delivers them to you, and our support team handles any issue with
        the order.
      </p>
      <p>
        Have a shop? <Link href="/sell">Sell on AGIZA</Link>.
      </p>
    </ProsePage>
  );
}
