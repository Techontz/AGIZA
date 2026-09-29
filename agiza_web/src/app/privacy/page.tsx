import type { Metadata } from "next";

import { ProsePage } from "@/components/service-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="September 2026">
      <p>This policy explains what AGIZA collects when you use the AGIZA website and app, and how it is used.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, phone number, optional email and company, and a securely hashed password.</li>
        <li>Delivery addresses you save, and the orders, payments, requests and support messages linked to your account.</li>
        <li>If you sell on AGIZA: your business, contact and payout details.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To process and deliver your orders, take payments and provide support.</li>
        <li>To send you verification codes and updates about your orders.</li>
        <li>
          Sellers only receive what they need to prepare an order (the items and a first name and delivery city) — never your phone
          number, address or payment details.
        </li>
      </ul>
      <h2>Payments</h2>
      <p>Mobile money and card payments are made on our payment provider&apos;s secure page. AGIZA does not store card numbers.</p>
      <h2>Your choices</h2>
      <p>You can update your profile at any time and close your account from the app. Contact {SUPPORT_EMAIL} with any privacy question.</p>
    </ProsePage>
  );
}
