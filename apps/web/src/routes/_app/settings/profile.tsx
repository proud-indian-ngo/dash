import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { ProfileSection } from "@/components/settings/sections/profile-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/profile";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/profile")({
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <ProfileSection />
    </SettingsPage>
  );
}
