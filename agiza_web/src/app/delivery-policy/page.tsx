import type { Metadata } from "next";

import { ProsePage } from "@/components/service-page";

export const metadata: Metadata = { title: "Delivery policy", alternates: { canonical: "/delivery-policy" } };

export default function DeliveryPolicyPage() {
  return (
    <ProsePage title="Delivery policy" updated="September 2026" draft>
      <h2>Where we deliver</h2>
      <p>AGIZA delivers across Tanzania. The delivery options available for your address are shown at checkout.</p>
      <h2>Delivery fees</h2>
      <p>
        The fee depends on your delivery city, the delivery method and the weight of your order. It is calculated and shown at
        checkout before you pay; there are no extra charges on delivery.
      </p>
      <h2>Orders from several stores</h2>
      <p>
        AGIZA collects the items from each store, brings them together and delivers them in one delivery, so an order with several
        sellers may take a little longer to prepare.
      </p>
      <h2>Tracking and receiving</h2>
      <ul>
        <li>You can follow your order in your account and receive updates by notification or SMS.</li>
        <li>Please check your items when they arrive. The rider may ask for a delivery confirmation.</li>
        <li>If you choose to pay on delivery, please have the exact amount ready.</li>
      </ul>
      <h2>Failed deliveries</h2>
      <p>If we can&apos;t reach you or deliver the order, we will contact you to arrange another attempt.</p>
    </ProsePage>
  );
}
