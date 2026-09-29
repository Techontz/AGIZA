import type { Metadata } from "next";

import { JsonLd } from "@/components/json-ld";
import { ProsePage } from "@/components/service-page";

export const metadata: Metadata = { title: "Frequently asked questions", alternates: { canonical: "/faq" } };

const FAQ = [
  ["Do I need an account to shop?", "No. You can browse, search and add to your cart without an account. You sign in or create an account (with your phone number) when you check out."],
  ["Can I buy from several stores in one order?", "Yes. Your cart can hold products from AGIZA and from several stores. You check out and pay once; AGIZA collects from each store and delivers to you."],
  ["How is the delivery fee calculated?", "At checkout, for your address and the delivery option you choose. When your items are collected from different places, each pickup is a separate shipment and the checkout shows the fee for each."],
  ["How can I pay?", "With mobile money or card on Selcom's secure checkout page when it's available, or pay AGIZA later by cash on delivery, bank transfer or Lipa number."],
  ["Can I cancel an order?", "You can cancel an unpaid order from your account until AGIZA starts preparing it. For anything else, contact support."],
  ["How do I sell on AGIZA?", "Apply from the Sell on AGIZA page with your AGIZA account. AGIZA reviews your application; once approved you can add products, which are reviewed before they go live."],
  ["What are Buy for me and Deliver for me?", "Buy for me: we buy a product abroad for you. Deliver for me: we ship goods you already bought abroad. Both start with a request; AGIZA replies with a quotation you can accept."],
];

export default function FaqPage() {
  return (
    <ProsePage title="Frequently asked questions">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        }}
      />
      <div className="divide-y divide-line">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-3">
            <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                {q}
                <span className="text-primary transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </span>
            </summary>
            <p className="mt-2 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </ProsePage>
  );
}
