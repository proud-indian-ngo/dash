import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";

import { BankingSection } from "@/components/settings/sections/banking-section";
import { SettingsPage } from "@/components/settings/settings-layout";
import { getSettingsSection } from "@/lib/settings-sections";

const PATH = "/settings/bank-accounts";

// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/_app/settings/bank-accounts")({
  head: () => ({
    meta: [
      {
        title: `${getSettingsSection(PATH).label} · Settings | ${env.VITE_APP_NAME}`,
      },
    ],
  }),
  component: BankAccountsSettingsPage,
});

function BankAccountsSettingsPage() {
  return (
    <SettingsPage path={PATH}>
      <BankingSection />
    </SettingsPage>
  );
}
