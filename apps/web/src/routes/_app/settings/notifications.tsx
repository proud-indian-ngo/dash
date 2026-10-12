import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { NotificationsSection } from "@/components/settings/sections/notifications-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/notifications";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/notifications")({
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: NotificationsSettingsPage,
});

function NotificationsSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <NotificationsSection />
    </SettingsPage>
  );
}
