import { EngineRoute } from "@/components/shipping-engine/engine-route";

import { ProfilesView } from "./view";

export const metadata = { title: "Shipping Profiles" };

export default function Page() {
  return (
    <EngineRoute>
      <ProfilesView />
    </EngineRoute>
  );
}
