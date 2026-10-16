import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { CostCentresSection } from "@/components/settings/sections/cost-centres-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/cost-centres";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/cost-centres")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.manage"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: CostCentresSettingsPage,
});

function CostCentresSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <CostCentresSection />
    </SettingsPage>
  );
}
