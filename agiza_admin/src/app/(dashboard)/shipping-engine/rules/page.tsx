import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { RulesView } from "./view";

export const metadata = { title: "Shipping Rules" };

export default function Page() {
  return (
    <EngineRoute>
      <RulesView />
    </EngineRoute>
  );
}
