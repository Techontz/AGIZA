import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { CarriersView } from "./view";

export const metadata = { title: "Carriers" };

export default function Page() {
  return (
    <EngineRoute>
      <CarriersView />
    </EngineRoute>
  );
}
