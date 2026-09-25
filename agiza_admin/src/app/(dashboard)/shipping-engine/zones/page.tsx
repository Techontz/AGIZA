import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { ZonesView } from "./view";

export const metadata = { title: "Shipping Zones" };

export default function Page() {
  return (
    <EngineRoute>
      <ZonesView />
    </EngineRoute>
  );
}
