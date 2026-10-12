import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { AccountSection } from "@/components/settings/sections/account-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/account";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/account")({
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <AccountSection />
    </SettingsPage>
  );
}
