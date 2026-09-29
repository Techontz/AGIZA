import type { Metadata } from "next";

import { OrderView } from "./order-view";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <OrderView reference={reference} />;
}
