import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { EngineSettingsView } from "./view";

export const metadata = { title: "Shipping Engine Settings" };

export default function Page() {
  return (
    <EngineRoute>
      <EngineSettingsView />
    </EngineRoute>
  );
}
