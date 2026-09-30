import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/components/service-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" updated="September 2026" draft>
      <p>
        This policy explains what personal information AGIZA collects when you use the AGIZA website and app, why, who it is shared
        with and the choices you have. It is intended to meet applicable Tanzanian law, including the Personal Data Protection Act,
        2022.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, phone number, optional email and company, and a securely hashed password.</li>
        <li>Delivery addresses you save, and the orders, payments, returns, reviews, saved products, requests and support messages linked to your account.</li>
        <li>Photos you upload as evidence for a return.</li>
        <li>If you sell on AGIZA: your business, contact, tax and payout details and the business documents you upload.</li>
        <li>Technical data needed to run the service securely: IP address, device type and app notification token.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To process, deliver and support your orders, returns and refunds, and to take payments.</li>
        <li>To send verification codes and updates about your orders by SMS, app notification or email.</li>
        <li>To prevent fraud and abuse and keep the service secure.</li>
        <li>To meet legal, tax and accounting obligations.</li>
      </ul>
      <h2>Who we share it with</h2>
      <ul>
        <li>
          Sellers receive only what they need to prepare an order: the items, and your first name and delivery city. They never see
          your phone number, full address or payment details.
        </li>
        <li>Our payment provider (to process mobile money and card payments), SMS and notification providers, and delivery riders (your delivery address and phone number, for your delivery only).</li>
        <li>Authorities, where the law requires it.</li>
      </ul>
      <p>AGIZA does not sell your personal information.</p>
      <h2>Payments</h2>
      <p>Mobile money and card payments are made on our payment provider&apos;s secure page. AGIZA does not store card numbers.</p>
      <h2>How long we keep it</h2>
      <p>
        We keep account data while your account is open. Order, payment and refund records are kept for as long as tax and accounting
        law requires, even after an account is closed.
      </p>
      <h2>Your rights</h2>
      <p>
        You can see and update your profile at any time, and delete your account from your account settings once no order is in
        progress. Deleting your account removes your name, phone number, email, addresses, saved products and notifications; the
        order and payment records we must keep are kept without them. To ask for a copy of your data or to object to how it is used,
        contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
      <h2>Cookies</h2>
      <p>
        See our <Link href="/cookies">cookie policy</Link>. We only use cookies that are needed to keep you signed in.
      </p>
      <h2>Changes</h2>
      <p>We will post any change to this policy on this page and update the date above.</p>
    </ProsePage>
  );
}
