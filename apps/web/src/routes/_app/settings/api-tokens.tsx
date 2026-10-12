import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { ApiTokensSection } from "@/components/settings/sections/api-tokens-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/api-tokens";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/api-tokens")({
  beforeLoad: ({ context }) => assertPermission(context, "settings.app_config"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: ApiTokensSettingsPage,
});

function ApiTokensSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <ApiTokensSection />
    </SettingsPage>
  );
}
