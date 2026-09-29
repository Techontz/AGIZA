import { CreditCard, Link2, PackageCheck, Plane } from "lucide-react";
import type { Metadata } from "next";

import { RequestForm } from "@/components/account/request-form";
import { ServicePage } from "@/components/service-page";

export const metadata: Metadata = {
  title: "Buy for me — shop abroad, delivered in Tanzania",
  description: "Send AGIZA a product from China, Dubai, the USA, the UK or India. We quote the full price, buy it, ship it and deliver it to you in Tanzania.",
  alternates: { canonical: "/buy-for-me" },
};

export default function BuyForMePage() {
  return (
    <ServicePage
      title="Buy for me"
      lead="Found something abroad? Tell us what you want. AGIZA quotes the full price to your door, buys it, ships it and delivers it in Tanzania."
      steps={[
        { icon: Link2, title: "Send the product", text: "A link or a description, how many, and where it should go." },
        { icon: CreditCard, title: "Accept the quotation", text: "One price including the item, shipping and clearance. Accept it and it becomes an order." },
        { icon: Plane, title: "We buy and ship", text: "AGIZA buys from the supplier and ships by air or sea." },
        { icon: PackageCheck, title: "Delivered to you", text: "Track every step in your account until it arrives." },
      ]}
      form={
        <>
          <h2 className="mb-4 text-lg font-semibold text-ink">Request a quotation</h2>
          <RequestForm type="buy_for_me" />
        </>
      }
    />
  );
}
