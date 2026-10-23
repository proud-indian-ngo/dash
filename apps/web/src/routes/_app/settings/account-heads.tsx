import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { AccountHeadsSection } from "@/components/settings/sections/account-heads-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { assertPermission } from "@/lib/route-guards";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/account-heads";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/account-heads")({
  beforeLoad: ({ context }) => assertPermission(context, "finance.manage"),
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: AccountHeadsSettingsPage,
});

function AccountHeadsSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <AccountHeadsSection />
    </SettingsPage>
  );
}
