import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { OverridesView } from "./view";

export const metadata = { title: "Overrides" };

export default function Page() {
  return (
    <EngineRoute>
      <OverridesView />
    </EngineRoute>
  );
}
