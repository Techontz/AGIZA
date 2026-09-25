import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { MethodsView } from "./view";

export const metadata = { title: "Shipping Methods" };

export default function Page() {
  return (
    <EngineRoute>
      <MethodsView />
    </EngineRoute>
  );
}
