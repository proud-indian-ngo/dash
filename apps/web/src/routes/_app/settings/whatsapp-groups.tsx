import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { WhatsAppGroupsSection } from "@/components/settings/sections/whatsapp-groups-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/whatsapp-groups";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/whatsapp-groups")({
  beforeLoad: ({ context }) =>
    assertPermission(context, "settings.whatsapp_groups"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: WhatsappGroupsSettingsPage,
});

function WhatsappGroupsSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <WhatsAppGroupsSection />
    </SettingsPage>
  );
}
