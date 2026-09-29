import type { Metadata } from "next";

import { SellerGate } from "@/components/seller/seller-gate";

export const metadata: Metadata = { title: "Seller dashboard", robots: { index: false } };

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <SellerGate>{children}</SellerGate>;
}
