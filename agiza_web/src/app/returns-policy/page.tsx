import type { Metadata } from "next";

import { ProsePage } from "@/components/service-page";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Return and refund policy", alternates: { canonical: "/returns-policy" } };

export default function ReturnsPolicyPage() {
  return (
    <ProsePage title="Return and refund policy" updated="September 2026" draft>
      <h2>Asking for a return</h2>
      <ul>
        <li>
          Open the order in your account and choose <strong>Return items</strong>. The button is available after delivery, for the
          number of days shown on the order.
        </li>
        <li>Choose the items and quantities, the reason, and explain the problem. You can add photos from your account on the website.</li>
        <li>AGIZA reviews every request, whichever store sold the item.</li>
      </ul>
      <h2>What happens next</h2>
      <ul>
        <li>If the return is accepted, AGIZA arranges for the items to be collected or brought back and inspects them.</li>
        <li>After inspection AGIZA approves or rejects the return and tells you why.</li>
        <li>An approved refund is paid by AGIZA to your original payment method or mobile money number, and you can follow its status in your account.</li>
      </ul>
      <h2>Items that can&apos;t be returned</h2>
      <p>Items that are used, damaged by the customer, or missing parts or packaging may be refused, unless they were faulty or not as described.</p>
      <h2>If a seller can&apos;t supply your order</h2>
      <p>If a seller can&apos;t supply part of your order, AGIZA cancels that part, reduces your total and refunds any amount you already paid for it.</p>
      <h2>Help</h2>
      <p>
        Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or the support chat in your account.
      </p>
    </ProsePage>
  );
}
