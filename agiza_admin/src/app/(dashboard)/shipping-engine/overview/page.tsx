import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { OverviewView } from "./view";

export const metadata = { title: "Shipping Engine" };

export default function Page() {
  return (
    <EngineRoute>
      <OverviewView />
    </EngineRoute>
  );
}
