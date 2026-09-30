import type { Metadata } from "next";

import { CompareView } from "./compare-view";

export const metadata: Metadata = { title: "Compare products", robots: { index: false }, alternates: { canonical: "/compare" } };

export default function ComparePage() {
  return <CompareView />;
}
