import { Barcode, CreditCard, PackageCheck, Ship } from "lucide-react";
import type { Metadata } from "next";

import { RequestForm } from "@/components/account/request-form";
import { ServicePage } from "@/components/service-page";

export const metadata: Metadata = {
  title: "Deliver for me — ship goods you bought abroad",
  description: "Already bought from a supplier abroad? AGIZA receives it at our warehouse, ships it to Tanzania, clears it and delivers it to you.",
  alternates: { canonical: "/deliver-for-me" },
};

export default function DeliverForMePage() {
  return (
    <ServicePage
      title="Deliver for me"
      lead="You bought it; we bring it home. Have your supplier send it to AGIZA's warehouse and we ship, clear and deliver it in Tanzania."
      steps={[
        { icon: Barcode, title: "Share the tracking number", text: "Tell us what's coming, from where, and the supplier's tracking number." },
        { icon: CreditCard, title: "Accept the quotation", text: "We quote shipping and clearance. Accept it and it becomes an order." },
        { icon: Ship, title: "We receive and ship", text: "AGIZA receives the goods abroad and ships them to Tanzania." },
        { icon: PackageCheck, title: "Delivered to you", text: "Follow each step in your account." },
      ]}
      form={
        <>
          <h2 className="mb-4 text-lg font-semibold text-ink">Request a quotation</h2>
          <RequestForm type="deliver_for_me" />
        </>
      }
    />
  );
}
