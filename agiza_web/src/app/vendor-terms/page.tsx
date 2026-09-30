import type { Metadata } from "next";

import { ProsePage } from "@/components/service-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Seller terms", alternates: { canonical: "/vendor-terms" } };

export default function VendorTermsPage() {
  return (
    <ProsePage title="Seller terms" updated="September 2026" draft>
      <p>These terms apply to businesses selling on AGIZA. They are in addition to the terms of use.</p>
      <h2>Joining</h2>
      <p>
        You apply with your AGIZA account and accurate business, tax and payout details, and may be asked for business documents.
        AGIZA may approve, ask for changes, reject or later suspend a store.
      </p>
      <h2>Listings</h2>
      <ul>
        <li>Products must be legal, genuine, accurately described and priced in Tanzanian shillings.</li>
        <li>AGIZA reviews products before they are published and may reject or disable them.</li>
        <li>You must keep your stock levels up to date.</li>
      </ul>
      <h2>Orders</h2>
      <ul>
        <li>Accept orders promptly and mark them ready when packed; AGIZA collects them from your pickup address.</li>
        <li>If you can&apos;t supply an item, report it on the order straight away. AGIZA will tell the customer and may cancel your part of the order.</li>
        <li>You never contact customers directly about an order; AGIZA handles all customer communication.</li>
      </ul>
      <h2>Commission and payouts</h2>
      <ul>
        <li>AGIZA deducts its commission, at the rate shown in your seller dashboard, from each sale.</li>
        <li>Earnings become payable once the order is delivered and fully paid, and are paid to your registered payout account on AGIZA&apos;s payout schedule.</li>
        <li>
          If a customer is refunded for your item after you were paid, the amount is deducted from your next payout. Every change is
          shown in your earnings statement.
        </li>
      </ul>
      <h2>Returns and reviews</h2>
      <p>You can respond to returns and reviews about your products. AGIZA makes the final decision on returns and refunds.</p>
      <h2>Contact</h2>
      <p>
        Seller support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </ProsePage>
  );
}
