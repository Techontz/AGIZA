import type { Metadata } from "next";

import { AccountNav } from "@/components/account/account-nav";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 py-6 sm:py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <AccountNav />
      <div className="min-w-0">{children}</div>
    </Container>
  );
}
