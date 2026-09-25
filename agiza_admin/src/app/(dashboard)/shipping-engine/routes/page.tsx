import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { RoutesView } from "./view";

export const metadata = { title: "Routes" };

export default function Page() {
  return (
    <EngineRoute>
      <RoutesView />
    </EngineRoute>
  );
}
