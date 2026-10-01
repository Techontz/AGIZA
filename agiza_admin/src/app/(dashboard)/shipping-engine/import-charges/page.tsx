import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { ImportChargesView } from "./view";

export const metadata = { title: "Import Charges" };

export default function Page() {
  return (
    <EngineRoute>
      <ImportChargesView />
    </EngineRoute>
  );
}
