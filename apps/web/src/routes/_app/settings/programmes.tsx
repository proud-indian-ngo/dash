import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { ProgrammesSection } from "@/components/settings/sections/programmes-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/programmes";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/programmes")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.manage"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: ProgrammesSettingsPage,
});

function ProgrammesSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <ProgrammesSection />
    </SettingsPage>
  );
}
