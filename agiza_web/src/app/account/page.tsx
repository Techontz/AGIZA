import type { Metadata } from "next";

import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function AccountPage() {
  return <ProfileView />;
}
