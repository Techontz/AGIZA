import { BadgeCheck, ClipboardCheck, PackagePlus, ShoppingCart, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Sell on AGIZA",
  description: "Open your store on AGIZA: reach customers on the AGIZA website and app. AGIZA takes the payment and delivers across Tanzania.",
  alternates: { canonical: "/sell" },
};

const STEPS = [
  { icon: ClipboardCheck, title: "Apply", text: "Tell us about your store and business with your AGIZA account." },
  { icon: BadgeCheck, title: "Get approved", text: "AGIZA reviews your application and may ask for details." },
  { icon: PackagePlus, title: "Add products", text: "Photos, prices and stock. AGIZA checks each product before it goes live." },
  { icon: ShoppingCart, title: "Receive orders", text: "Accept the order and get the items ready. AGIZA collects and delivers." },
];

export default function SellPage() {
  return (
    <>
      <section className="border-b border-line bg-surface">
        <Container className="grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Breadcrumbs items={[{ label: "Sell on AGIZA" }]} />
            <h1 className="text-[30px] leading-tight font-bold text-ink sm:text-[40px]">Sell to customers across Tanzania</h1>
            <p className="mt-3 max-w-xl text-[17px] text-muted">
              Open your store on AGIZA. Your products appear on the AGIZA website and app; customers pay AGIZA, and AGIZA collects
              from you and delivers.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/sell/apply" size="lg">
                Apply to sell
              </ButtonLink>
              <ButtonLink href="/seller" size="lg" variant="secondary">
                I already have a store
              </ButtonLink>
            </div>
          </div>
          <ul className="grid gap-3">
            {[
              { icon: Wallet, title: "Get paid for every delivered order", text: "Clear earnings per order: sale, AGIZA commission and your net amount." },
              { icon: Truck, title: "No delivery hassle", text: "AGIZA picks up from your shop and handles delivery and tracking." },
              { icon: BadgeCheck, title: "A verified store page", text: "Your own store page with your logo, products and a verified badge." },
            ].map((b) => (
              <li key={b.title} className="flex gap-3 rounded-lg bg-canvas p-4">
                <b.icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block font-semibold text-ink">{b.title}</span>
                  <span className="text-[14px] text-muted">{b.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </section>
      <Container className="py-10 sm:py-12">
        <h2 id="how" className="mb-5 scroll-mt-32 text-xl font-semibold text-ink sm:text-2xl">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg bg-surface p-5 shadow-card">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-brand">
                <s.icon className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-[13px] font-semibold text-muted">Step {i + 1}</p>
              <h3 className="text-[16px] font-semibold text-ink">{s.title}</h3>
              <p className="mt-1 text-[14px] text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[14px] text-muted">
          AGIZA charges a commission on each sale, shown in your seller dashboard. Your earnings become payable once an order is
          delivered and paid.
        </p>
      </Container>
    </>
  );
}
