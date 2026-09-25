import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { TestRateView } from "./view";

export const metadata = { title: "Test Shipping Rate" };

export default function Page() {
  return (
    <EngineRoute>
      <TestRateView />
    </EngineRoute>
  );
}
