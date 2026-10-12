import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { AdminActionsSection } from "@/components/settings/sections/admin-actions-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/maintenance";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/maintenance")({
  beforeLoad: ({ context }) => assertPermission(context, "jobs.manage"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: MaintenanceSettingsPage,
});

function MaintenanceSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <AdminActionsSection />
    </SettingsPage>
  );
}
