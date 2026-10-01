import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderView } from "@/app/account/orders/[reference]/order-view";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

/** A guest's order (website checkout without an account), opened with its signed link. */
export default async function GuestOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ reference }, { token }] = await Promise.all([params, searchParams]);
  if (!token) notFound();
  return (
    <Container className="py-6 sm:py-8">
      <OrderView reference={reference} token={token} />
    </Container>
  );
}
